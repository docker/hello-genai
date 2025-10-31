use actix_web::{get, post, web, HttpResponse, Responder, HttpRequest};
use tera::{Tera, Context};
use actix_web::http::header::{HeaderName, HeaderValue};
use serde::{Deserialize, Serialize};
use crate::config::AppConfig;
use crate::cache::AppCache;
use crate::rate_limit::RateLimiter;
use std::sync::Arc;
use std::fs;

#[get("/")]
pub async fn index() -> impl Responder {
    // Initialize Tera templating engine for templates directory
    let tera = match tera::Tera::new("templates/**/*") {
        Ok(t) => t,
        Err(e) => {
            eprintln!("Template parsing error: {}", e);
            std::process::exit(1);
        }
    };

    // Load configuration from environment
    let config = crate::config::AppConfig::from_env();
    let mut context = tera::Context::new();
    context.insert("llm_model", &config.llm_model_name);
    context.insert("llm_base_url", &config.llm_base_url);

    // Render the index template with context
    let rendered = tera.render("index.html", &context)
        .unwrap_or_else(|_| "<h1>Hello GenAI</h1>".to_string());
    HttpResponse::Ok().content_type("text/html").body(rendered)
}


#[get("/example")]
pub async fn example() -> impl Responder {
    let example = fs::read_to_string("static/examples/structured_response_example.md").unwrap_or_default();
    HttpResponse::Ok().json(serde_json::json!({"response": example}))
}

#[get("/health")]
pub async fn health() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "timestamp": chrono::Utc::now().to_rfc3339(),
    }))
}

#[get("/api/docs")]
pub async fn api_docs() -> impl Responder {
    HttpResponse::Ok().content_type("text/html").body(
        fs::read_to_string("templates/swagger.html").unwrap_or_else(|_| "<h1>API Docs Not Found</h1>".to_string())
    )
}

#[derive(Deserialize)]
pub struct ChatRequest {
    pub message: String,
}

#[derive(Serialize)]
pub struct ChatResponse {
    pub response: String,
}

#[derive(Serialize)]
pub struct ModelInfoResponse {
    pub model: String,
}

#[post("/api/chat")]
pub async fn chat_api(
    req: HttpRequest,
    config: web::Data<AppConfig>,
    cache: web::Data<Arc<AppCache>>,
    rate_limiter: web::Data<Arc<RateLimiter>>,
    payload: web::Json<ChatRequest>,
) -> impl Responder {
    let ip = req.connection_info().realip_remote_addr().unwrap_or("unknown").to_string();
    if !rate_limiter.allow(&ip) {
        return HttpResponse::TooManyRequests().json(serde_json::json!({"error": "Rate limit exceeded"}));
    }
    let message = &payload.message;
    if message.len() > 4000 {
        return HttpResponse::BadRequest().json(serde_json::json!({"error": "Message too long (max 4000 chars)"}));
    }
    // Special command for getting model info
    if message == "!modelinfo" {
        return HttpResponse::Ok().json(ModelInfoResponse {
            model: config.llm_model_name.clone()
        });
    }
    if let Some(resp) = cache.get(message) {
        return HttpResponse::Ok().json(ChatResponse { response: resp });
    }
    // Call LLM API
    let llm_url = format!("{}/chat/completions", config.llm_base_url);
    let client = reqwest::Client::new();
    let system_prompt = "You are a helpful assistant. Please provide structured responses using markdown formatting. Use headers (# for main points), bullet points (- for lists), bold (**text**) for emphasis, and code blocks (```code```) for code examples. Organize your responses with clear sections and concise explanations.";
    let req_body = serde_json::json!({
        "model": config.llm_model_name,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": message}
        ]
    });
    let resp = client.post(&llm_url)
        .json(&req_body)
        .send()
        .await;
    match resp {
        Ok(r) => {
            if r.status().is_success() {
                let v: serde_json::Value = r.json().await.unwrap_or_default();
                let content = v["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string();
                cache.set(message.clone(), content.clone());
                HttpResponse::Ok().json(ChatResponse { response: content })
            } else {
                HttpResponse::InternalServerError().json(serde_json::json!({"error": "LLM API error"}))
            }
        },
        Err(_) => HttpResponse::InternalServerError().json(serde_json::json!({"error": "Failed to call LLM API"})),
    }
}

// Security headers middleware
use std::future::{ready, Ready};
use actix_web::dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform};
use futures::future::LocalBoxFuture;

pub struct SecurityHeaders;

impl<S, B> Transform<S, ServiceRequest> for SecurityHeaders
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = actix_web::Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = actix_web::Error;
    type Transform = SecurityHeadersMiddleware<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(SecurityHeadersMiddleware { service }))
    }
}

pub struct SecurityHeadersMiddleware<S> {
    service: S,
}

impl<S, B> Service<ServiceRequest> for SecurityHeadersMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = actix_web::Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = actix_web::Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let fut = self.service.call(req);

        Box::pin(async move {
            let mut res = fut.await?;
            let headers = res.headers_mut();
            headers.insert(HeaderName::from_static("x-content-type-options"), HeaderValue::from_static("nosniff"));
            headers.insert(HeaderName::from_static("x-frame-options"), HeaderValue::from_static("sameorigin"));
            headers.insert(HeaderName::from_static("x-xss-protection"), HeaderValue::from_static("1; mode=block"));
            headers.insert(HeaderName::from_static("content-security-policy"), HeaderValue::from_static("default-src 'self'; img-src 'self' data:; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; font-src 'self' https://cdnjs.cloudflare.com"));
            Ok(res)
        })
    }
}
