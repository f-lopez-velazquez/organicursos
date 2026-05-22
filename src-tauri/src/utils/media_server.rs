use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::net::TcpListener;
use std::path::PathBuf;
use std::thread;

use anyhow::{Context, Result};
use base64::Engine;
use tiny_http::{Header, Method, Request, Response, ResponseBox, Server, StatusCode};

pub struct MediaServer {
    base_url: String,
    _thread: thread::JoinHandle<()>,
}

impl MediaServer {
    pub fn start() -> Result<Self> {
        let listener = TcpListener::bind("127.0.0.1:0").context("no se pudo iniciar el servidor local de medios")?;
        let address = listener
            .local_addr()
            .context("no se pudo resolver el puerto del servidor local de medios")?;
        let server = Server::from_listener(listener, None)
            .map_err(|error| anyhow::anyhow!("no se pudo construir el servidor local de medios: {error}"))?;

        let handle = thread::spawn(move || {
            for request in server.incoming_requests() {
                let response: ResponseBox = match resolve_file_request(request.url()) {
                    Ok(Some((path, mime_type))) => match serve_file(&request, &path, &mime_type) {
                        Ok(response) => response,
                        Err(_) => text_response(StatusCode(404), "Archivo no encontrado").boxed(),
                    },
                    Ok(None) => text_response(StatusCode(404), "Ruta no disponible").boxed(),
                    Err(_) => text_response(StatusCode(400), "Solicitud invalida").boxed(),
                };

                let _ = request.respond(response);
            }
        });

        Ok(Self {
            base_url: format!("http://127.0.0.1:{}", address.port()),
            _thread: handle,
        })
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }
}

fn resolve_file_request(url: &str) -> Result<Option<(PathBuf, String)>> {
    let prefix = "/local-file/";
    let encoded = match url.split('?').next() {
        Some(path) => path.strip_prefix(prefix),
        None => None,
    };

    let Some(encoded) = encoded else {
        return Ok(None);
    };

    let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(encoded)
        .context("no se pudo decodificar la ruta solicitada")?;
    let decoded_path = String::from_utf8(decoded).context("la ruta solicitada no es UTF-8 valida")?;
    let path = PathBuf::from(decoded_path);

    if !path.is_absolute() {
        anyhow::bail!("la ruta solicitada debe ser absoluta");
    }

    let mime_type = mime_type_for(&path);
    Ok(Some((path, mime_type.to_string())))
}

fn media_headers(mime_type: &str) -> Vec<Header> {
    let mut headers = Vec::new();

    if let Ok(header) = Header::from_bytes(&b"Content-Type"[..], mime_type.as_bytes()) {
        headers.push(header);
    }
    if let Ok(header) = Header::from_bytes(&b"Accept-Ranges"[..], &b"bytes"[..]) {
        headers.push(header);
    }
    if let Ok(header) = Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]) {
        headers.push(header);
    }

    headers
}

fn serve_file(request: &Request, path: &std::path::Path, mime_type: &str) -> Result<ResponseBox> {
    let mut file = File::open(path)?;
    let file_len = file.metadata()?.len();
    let range_header = request
        .headers()
        .iter()
        .find(|header| header.field.equiv("Range"))
        .map(|header| header.value.as_str().to_string());

    if let Some(range_header) = range_header {
        if let Some((start, end)) = parse_range_header(&range_header, file_len) {
            let bytes_to_read = end.saturating_sub(start) + 1;
            let mut buffer = vec![0; bytes_to_read as usize];
            file.seek(SeekFrom::Start(start))?;
            file.read_exact(&mut buffer)?;

            let mut response = if request.method() == &Method::Head {
                Response::new(
                    StatusCode(206),
                    Vec::new(),
                    std::io::Cursor::new(Vec::new()),
                    Some(0),
                    None,
                )
                .boxed()
            } else {
                Response::from_data(buffer).with_status_code(StatusCode(206)).boxed()
            };

            for header in media_headers(mime_type) {
                response.add_header(header);
            }
            add_header(&mut response, "Content-Range", &format!("bytes {start}-{end}/{file_len}"));
            add_header(&mut response, "Content-Length", &bytes_to_read.to_string());
            add_header(&mut response, "Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");
            return Ok(response);
        }
    }

    let mut response = if request.method() == &Method::Head {
        Response::new(
            StatusCode(200),
            Vec::new(),
            std::io::Cursor::new(Vec::new()),
            Some(0),
            None,
        )
        .boxed()
    } else {
        Response::from_file(file).with_chunked_threshold(usize::MAX).boxed()
    };

    for header in media_headers(mime_type) {
        response.add_header(header);
    }
    add_header(&mut response, "Content-Length", &file_len.to_string());
    Ok(response)
}

fn parse_range_header(value: &str, file_len: u64) -> Option<(u64, u64)> {
    let bytes = value.strip_prefix("bytes=")?;
    let first = bytes.split(',').next()?.trim();
    let (start_raw, end_raw) = first.split_once('-')?;

    if start_raw.is_empty() {
        let suffix = end_raw.parse::<u64>().ok()?;
        if suffix == 0 {
            return None;
        }
        let start = file_len.saturating_sub(suffix);
        let end = file_len.saturating_sub(1);
        return Some((start, end));
    }

    let start = start_raw.parse::<u64>().ok()?;
    if start >= file_len {
        return None;
    }

    let end = if end_raw.is_empty() {
        file_len.saturating_sub(1)
    } else {
        end_raw.parse::<u64>().ok()?.min(file_len.saturating_sub(1))
    };

    if end < start {
        return None;
    }

    Some((start, end))
}

fn add_header(response: &mut ResponseBox, name: &str, value: &str) {
    if let Ok(header) = Header::from_bytes(name.as_bytes(), value.as_bytes()) {
        response.add_header(header);
    }
}

fn text_response(status: StatusCode, message: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    let mut response = Response::from_string(message.to_string())
        .with_status_code(status)
        .with_chunked_threshold(usize::MAX);
    if let Ok(header) = Header::from_bytes(&b"Content-Type"[..], &b"text/plain; charset=utf-8"[..]) {
        response.add_header(header);
    }
    response
}

fn mime_type_for(path: &std::path::Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .as_deref()
    {
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("png") => "image/png",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        Some("bmp") => "image/bmp",
        Some("svg") => "image/svg+xml",
        Some("mp4" | "m4v") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mov") => "video/quicktime",
        Some("mp3") => "audio/mpeg",
        Some("wav") => "audio/wav",
        Some("ogg") => "audio/ogg",
        Some("m4a") => "audio/mp4",
        Some("vtt") => "text/vtt",
        Some("srt") => "application/x-subrip",
        Some("pdf") => "application/pdf",
        Some("html" | "htm") => "text/html; charset=utf-8",
        Some("txt" | "md") => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}
