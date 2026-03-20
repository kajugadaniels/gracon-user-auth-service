// Raw response shape from the national ID API
// We only map the fields we actually need — everything else is ignored
export interface CitizenApiRawData {
  documentType: string;
  nid: string;
  surName: string;
  postNames: string;
  sex: string;
  dateOfBirth: string; // comes as "DD/MM/YYYY" string — we parse it
  countryOfBirth: string;
}

export interface CitizenApiRawResponse {
  status: string;
  data: CitizenApiRawData & Record<string, unknown>; // & Record allows extra fields without TS errors
}

// Clean shape we return from our service — only what we need
export interface CitizenData {
  documentType: string;
  nid: string;
  surName: string;
  postNames: string;
  sex: string;
  dateOfBirth: Date; // already parsed into a Date object
  countryOfBirth: string;
}
