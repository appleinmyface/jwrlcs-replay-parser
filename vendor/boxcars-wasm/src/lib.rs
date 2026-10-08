// Small local adaptation of carl-sauter/boxcars.js at
// 6a79b8d0d49a0d7c59651e916a5ec9d2a50b7aeb (see PROVENANCE.md).
// Decode with unmodified, released upstream boxcars; do not skip attributes.
use boxcars::{CrcCheck, NetworkParse, ParserBuilder};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = JSON, js_name = parse)]
    fn json_parse(text: String) -> JsValue;
}

#[wasm_bindgen(js_name = "CrcCheck")]
pub enum InternalCrcCheck { Always, Never, OnError }

#[wasm_bindgen(js_name = "NetworkParse")]
pub enum InternalNetworkParse { Always, Never, IgnoreOnError }

#[wasm_bindgen]
pub struct BoxcarsParser {
    data: Box<[u8]>,
    crc_check: Option<CrcCheck>,
    network_parse: Option<NetworkParse>,
}

#[wasm_bindgen]
impl BoxcarsParser {
    #[wasm_bindgen(constructor)]
    pub fn new(data: Box<[u8]>) -> Self {
        Self { data, crc_check: None, network_parse: None }
    }

    #[wasm_bindgen(js_name = "setCrcCheck")]
    pub fn set_crc_check(mut self, check: InternalCrcCheck) -> Self {
        self.crc_check = Some(match check {
            InternalCrcCheck::Always => CrcCheck::Always,
            InternalCrcCheck::Never => CrcCheck::Never,
            InternalCrcCheck::OnError => CrcCheck::OnError,
        });
        self
    }

    #[wasm_bindgen(js_name = "setNetworkParse")]
    pub fn set_network_parse(mut self, parse: InternalNetworkParse) -> Self {
        self.network_parse = Some(match parse {
            InternalNetworkParse::Always => NetworkParse::Always,
            InternalNetworkParse::Never => NetworkParse::Never,
            InternalNetworkParse::IgnoreOnError => NetworkParse::IgnoreOnError,
        });
        self
    }

    pub fn parse(self) -> Result<JsValue, JsValue> {
        let mut builder = ParserBuilder::new(&self.data);
        if let Some(check) = self.crc_check { builder = builder.with_crc_check(check); }
        if let Some(mode) = self.network_parse { builder = builder.with_network_parse(mode); }
        // Return an exception instead of upstream binding's unwrap/panic.
        // Detailed decoder contexts include private IDs: never log them.
        let replay = builder.parse().map_err(|_| JsValue::from_str("Replay decoding failed"))?;
        // Upstream serde serializes QWord/Int64/platform u64 identifiers as
        // strings before JSON.parse. Never convert them through JS Number.
        let json = serde_json::to_string(&replay)
            .map_err(|_| JsValue::from_str("Replay serialization failed"))?;
        Ok(json_parse(json))
    }
}
