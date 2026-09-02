import { BoxcarsParser, CrcCheck, NetworkParse } from "boxcars.js";

export function decodeReplay(bytes, { network = false } = {}) {
  return new BoxcarsParser(bytes)
    .setCrcCheck(CrcCheck.OnError)
    .setNetworkParse(network ? NetworkParse.Always : NetworkParse.Never)
    .parse();
}
