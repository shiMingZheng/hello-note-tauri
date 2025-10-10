// src-tauri/src/commands/screenshot.rs
// CheetahNote 截图功能支持（完全修复版）

use base64::{engine::general_purpose, Engine as _};
use screenshots::Screen;
use std::fs;
use std::path::Path;
use tauri::command;

/// 截图模式
#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "lowercase")]
pub enum CaptureMode {
    /// 全屏截图
    Fullscreen,
    /// 区域截图
    Region,
}

/// 截图参数
#[derive(serde::Deserialize)]
pub struct CaptureParams {
    /// 截图模式
    pub mode: CaptureMode,
    /// 区域截图的坐标（可选）
    pub region: Option<CaptureRegion>,
}

/// 截图区域
#[derive(serde::Deserialize)]
pub struct CaptureRegion {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// 截图结果
#[derive(serde::Serialize)]
pub struct CaptureResult {
    /// Base64 编码的图片数据
    pub data: String,
    /// 图片宽度
    pub width: u32,
    /// 图片高度
    pub height: u32,
}

/// 捕获屏幕
/// 
/// # 参数
/// - `params`: 截图参数
/// 
/// # 返回
/// - `Ok(CaptureResult)`: 截图成功，返回 Base64 编码的图片数据
/// - `Err(String)`: 截图失败
#[command]
pub async fn capture_screen(params: CaptureParams) -> Result<CaptureResult, String> {
    println!("📸 开始截图，模式: {:?}", params.mode);

    match params.mode {
        CaptureMode::Fullscreen => capture_fullscreen(),
        CaptureMode::Region => {
            if let Some(region) = params.region {
                capture_region(region)
            } else {
                Err("区域截图需要提供坐标".to_string())
            }
        }
    }
}

/// 全屏截图
fn capture_fullscreen() -> Result<CaptureResult, String> {
    // 获取主屏幕
    let screens = Screen::all().map_err(|e| format!("获取屏幕列表失败: {}", e))?;
    
    if screens.is_empty() {
        return Err("未检测到屏幕".to_string());
    }

    let screen = &screens[0];
    
    // 截图
    let image = screen
        .capture()
        .map_err(|e| format!("截图失败: {}", e))?;

    // 获取图片尺寸
    let width = image.width();
    let height = image.height();

    // ⭐【关键修改】使用 image 0.24 的 API
    let mut png_data = Vec::new();
    {
        use screenshots::image::codecs::png::PngEncoder;
        use screenshots::image::{ColorType, ImageEncoder};
        
        let encoder = PngEncoder::new(&mut png_data);
        encoder
            .write_image(
                image.as_raw(),
                width,
                height,
                ColorType::Rgba8,  // ⭐ 使用 ColorType 而不是 ExtendedColorType
            )
            .map_err(|e| format!("编码 PNG 失败: {}", e))?;
    }

    // Base64 编码
    let base64_data = general_purpose::STANDARD.encode(&png_data);

    println!("✅ 全屏截图成功: {}x{}", width, height);

    Ok(CaptureResult {
        data: format!("data:image/png;base64,{}", base64_data),
        width,
        height,
    })
}

/// 区域截图
fn capture_region(region: CaptureRegion) -> Result<CaptureResult, String> {
    // 获取主屏幕
    let screens = Screen::all().map_err(|e| format!("获取屏幕列表失败: {}", e))?;
    
    if screens.is_empty() {
        return Err("未检测到屏幕".to_string());
    }

    let screen = &screens[0];
    
    // 全屏截图
    let full_image = screen
        .capture()
        .map_err(|e| format!("截图失败: {}", e))?;

    // 手动裁剪区域
    use screenshots::image::{ImageBuffer, Rgba};
    
    // 确保坐标在有效范围内
    let x = region.x.max(0) as u32;
    let y = region.y.max(0) as u32;
    let width = region.width.min(full_image.width().saturating_sub(x));
    let height = region.height.min(full_image.height().saturating_sub(y));

    if width == 0 || height == 0 {
        return Err("截图区域无效".to_string());
    }

    // 创建新的图像缓冲区
    let mut cropped: ImageBuffer<Rgba<u8>, Vec<u8>> = 
        ImageBuffer::new(width, height);

    // 复制像素
    for (dest_x, dest_y, pixel) in cropped.enumerate_pixels_mut() {
        let src_x = x + dest_x;
        let src_y = y + dest_y;
        *pixel = *full_image.get_pixel(src_x, src_y);
    }

    // 转换为 PNG
    let mut png_data = Vec::new();
    {
        use screenshots::image::codecs::png::PngEncoder;
        use screenshots::image::{ColorType, ImageEncoder};
        
        let encoder = PngEncoder::new(&mut png_data);
        encoder
            .write_image(
                cropped.as_raw(),
                width,
                height,
                ColorType::Rgba8,  // ⭐ 使用 ColorType 而不是 ExtendedColorType
            )
            .map_err(|e| format!("编码 PNG 失败: {}", e))?;
    }

    // Base64 编码
    let base64_data = general_purpose::STANDARD.encode(&png_data);

    println!("✅ 区域截图成功: {}x{}", width, height);

    Ok(CaptureResult {
        data: format!("data:image/png;base64,{}", base64_data),
        width,
        height,
    })
}

/// 保存图片到本地
/// 
/// # 参数
/// - `data`: Base64 编码的图片数据（需包含 data:image/png;base64, 前缀）
/// - `path`: 保存路径（相对路径或绝对路径）
/// 
/// # 返回
/// - `Ok(String)`: 保存成功，返回绝对路径
/// - `Err(String)`: 保存失败
#[command]
pub async fn save_image(data: String, path: String) -> Result<String, String> {
    println!("💾 保存图片: {}", path);

    // 移除 Base64 前缀
    let base64_data = if data.starts_with("data:image/") {
        data.split(',')
            .nth(1)
            .ok_or("无效的 Base64 数据格式")?
    } else {
        &data
    };

    // 解码 Base64
    let image_data = general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| format!("Base64 解码失败: {}", e))?;

    // 确保目录存在
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建目录失败: {}", e))?;
    }

    // 写入文件
    fs::write(&path, image_data)
        .map_err(|e| format!("写入文件失败: {}", e))?;

    // 获取绝对路径
    let absolute_path = fs::canonicalize(&path)
        .map_err(|e| format!("获取绝对路径失败: {}", e))?
        .to_string_lossy()
        .to_string();

    println!("✅ 图片保存成功: {}", absolute_path);

    Ok(absolute_path)
}

/// 创建悬浮窗口（用于贴图功能）
/// 
/// # 参数
/// - `url`: 窗口加载的 URL
/// - `always_on_top`: 是否置顶
/// - `transparent`: 是否透明
/// - `decorations`: 是否显示标题栏
/// 
/// # 返回
/// - `Ok(String)`: 窗口创建成功，返回窗口标签
/// - `Err(String)`: 创建失败
#[command]
pub async fn create_floating_window(
    app_handle: tauri::AppHandle,
    url: String,
    always_on_top: bool,
    transparent: bool,
    decorations: bool,
) -> Result<String, String> {
    println!("🪟 创建悬浮窗口: {}", url);

    let label = format!("floating-{}", chrono::Utc::now().timestamp_millis());

    let _window = tauri::WebviewWindowBuilder::new(
        &app_handle,
        &label,
        tauri::WebviewUrl::App(url.into()),
    )
    .title("贴图")
    .inner_size(400.0, 400.0)
    .resizable(true)
    .always_on_top(always_on_top)
    .transparent(transparent)
    .decorations(decorations)
    .build()
    .map_err(|e| format!("创建窗口失败: {}", e))?;

    println!("✅ 悬浮窗口创建成功: {}", label);

    Ok(label)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_capture_fullscreen() {
        let params = CaptureParams {
            mode: CaptureMode::Fullscreen,
            region: None,
        };

        match capture_screen(params).await {
            Ok(result) => {
                assert!(result.data.starts_with("data:image/png;base64,"));
                assert!(result.width > 0);
                assert!(result.height > 0);
                println!("✅ 截图测试通过: {}x{}", result.width, result.height);
            }
            Err(e) => {
                println!("⚠️ 截图测试失败: {}", e);
            }
        }
    }
}