import { BoxcarsParser, CrcCheck, NetworkParse } from "@jwrlcs/boxcars-wasm";

export function decodeReplay(bytes, { network = true } = {}) {
  const parse = (networkMode) => new BoxcarsParser(bytes)
    .setCrcCheck(CrcCheck.OnError)
    .setNetworkParse(networkMode)
    .parse();

  if (!network) return parse(NetworkParse.Never);

  try {
    const decoded = parse(NetworkParse.IgnoreOnError);
    if (!decoded.network_frames?.frames?.length) {
      Object.defineProperty(decoded, "_jwrlcs_network_decode_failed", {
        value: true,
        enumerable: false,
      });
    }
    return decoded;
  } catch (networkError) {
    // A network-stream incompatibility must not discard a valid scoreboard.
    // Parse the header/body again without network frames and leave advanced
    // values unavailable rather than manufacturing zeroes.
    const decoded = parse(NetworkParse.Never);
    Object.defineProperty(decoded, "_jwrlcs_network_decode_failed", {
      value: true,
      enumerable: false,
    });
    return decoded;
  }
}
