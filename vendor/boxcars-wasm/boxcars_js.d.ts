/* tslint:disable */
/* eslint-disable */
export enum CrcCheck {
  Always = 0,
  Never = 1,
  OnError = 2,
}
export enum NetworkParse {
  Always = 0,
  Never = 1,
  IgnoreOnError = 2,
}
export class BoxcarsParser {
  free(): void;
  constructor(data: Uint8Array);
  setCrcCheck(check: CrcCheck): BoxcarsParser;
  setNetworkParse(parse: NetworkParse): BoxcarsParser;
  parse(): any;
}
