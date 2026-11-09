use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct AppError {
    pub code: String,
    pub message: String,
}

impl AppError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self { code: code.to_string(), message: message.into() }
    }
    #[allow(dead_code)]
    pub fn not_implemented() -> Self {
        Self::new("internal", "not implemented")
    }
}

pub type CmdResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn serializes_as_code_and_message() {
        let e = AppError::new("no_input_device", "No microphone found.");
        assert_eq!(serde_json::to_string(&e).unwrap(), r#"{"code":"no_input_device","message":"No microphone found."}"#);
    }
}
