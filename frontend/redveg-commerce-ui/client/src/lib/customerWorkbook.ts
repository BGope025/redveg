import { read, utils } from "xlsx";

export type ImportedCustomerRow = {
  rowNumber: number;
  name: string;
  phone: string;
  address?: string;
  locality?: string;
  pincode?: string;
  notes?: string;
};

type CustomerField = keyof Omit<ImportedCustomerRow, "rowNumber">;

const HEADER_ALIASES: Record<string, CustomerField> = {
  name: "name",
  customer: "name",
  customername: "name",
  customersname: "name",
  nameofcustomer: "name",
  client: "name",
  clientname: "name",
  fullname: "name",
  customerfullname: "name",
  contactname: "name",
  phone: "phone",
  phoneno: "phone",
  mobileno: "phone",
  mobilenumber: "phone",
  mobilephone: "phone",
  mobile: "phone",
  phonenumber: "phone",
  customerphone: "phone",
  customerphonenumber: "phone",
  customermobile: "phone",
  customermobilenumber: "phone",
  primaryphone: "phone",
  primarymobile: "phone",
  contact: "phone",
  contactnumber: "phone",
  contactno: "phone",
  whatsapp: "phone",
  whatsappnumber: "phone",
  whatsappno: "phone",
  address: "address",
  addressline: "address",
  fulladdress: "address",
  customeraddress: "address",
  deliveryaddress: "address",
  streetaddress: "address",
  address1: "address",
  locality: "locality",
  area: "locality",
  neighborhood: "locality",
  pincode: "pincode",
  postalcode: "pincode",
  zipcode: "pincode",
  zip: "pincode",
  pin: "pincode",
  notes: "notes",
  note: "notes",
  instruction: "notes",
  instructions: "notes",
};

function normalizeHeader(value: unknown) {
  return String(value ?? "").replace(/^\uFEFF/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function classifyHeader(value: unknown): CustomerField | undefined {
  const normalized = normalizeHeader(value);
  const exactMatch = HEADER_ALIASES[normalized];
  if (exactMatch) return exactMatch;

  if (/(mobile|phone|whatsapp)/.test(normalized)) return "phone";
  if (normalized === "contact" || /contact(number|no|phone|mobile)/.test(normalized)) return "phone";
  if (/(address|street|house(number|no)|building)/.test(normalized)) return "address";
  if (/(locality|area|neighbou?rhood|suburb)/.test(normalized)) return "locality";
  if (/(pincode|postalcode|zipcode|^pin$|^zip$)/.test(normalized)) return "pincode";
  if (/(notes?|instructions?)/.test(normalized)) return "notes";
  if (/name/.test(normalized) && !/(username|filename|productname|sheetname|companyname)/.test(normalized)) return "name";
  return undefined;
}

function mapHeaders(row: unknown[], nextHeaderRow?: unknown[]) {
  const headers = new Map<number, CustomerField>();
  const columnCount = Math.max(row.length, nextHeaderRow?.length || 0);
  for (let index = 0; index < columnCount; index += 1) {
    const current = String(row[index] ?? "").trim();
    const next = String(nextHeaderRow?.[index] ?? "").trim();
    const field = classifyHeader(current) || (nextHeaderRow && classifyHeader([current, next].filter(Boolean).join(" ")));
    if (field) headers.set(index, field);
  }
  return headers;
}

function findHeader(rows: unknown[][]) {
  const searchLimit = Math.min(rows.length, 100);
  for (let index = 0; index < searchLimit; index += 1) {
    const singleRowHeaders = mapHeaders(rows[index]);
    const singleRowFields = Array.from(singleRowHeaders.values());
    if (singleRowFields.includes("name") && singleRowFields.includes("phone")) {
      return { headers: singleRowHeaders, headerEndIndex: index };
    }

    if (index + 1 < rows.length) {
      const combinedHeaders = mapHeaders(rows[index], rows[index + 1]);
      const combinedFields = Array.from(combinedHeaders.values());
      if (combinedFields.includes("name") && combinedFields.includes("phone")) {
        return { headers: combinedHeaders, headerEndIndex: index + 1 };
      }
    }
  }
  return null;
}

function parseSheetRows(worksheet: ReturnType<typeof utils.aoa_to_sheet>, rows: unknown[][]) {
  const detectedHeader = findHeader(rows);
  if (!detectedHeader) return null;

  const rangeStartRow = worksheet["!ref"] ? utils.decode_range(worksheet["!ref"]!).s.r : 0;
  const customerRows = rows.slice(detectedHeader.headerEndIndex + 1).map((row, index) => {
    const values: ImportedCustomerRow = {
      rowNumber: rangeStartRow + detectedHeader.headerEndIndex + index + 2,
      name: "",
      phone: "",
      address: "",
      locality: "",
      pincode: "",
      notes: "",
    };
    detectedHeader.headers.forEach((field, column) => {
      const value = String(row[column] ?? "").trim();
      if (value) values[field] = value;
    });
    return values;
  }).filter((row) => row.name || row.phone || row.address || row.locality || row.pincode || row.notes);

  return customerRows;
}

export async function parseCustomerWorkbook(file: File): Promise<ImportedCustomerRow[]> {
  if (file.size > 20 * 1024 * 1024) throw new Error("Choose a spreadsheet smaller than 20 MB.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !["xls", "xlsx", "csv"].includes(extension)) {
    throw new Error("Choose an .xls, .xlsx, or .csv file.");
  }

  let workbook;
  try {
    workbook = read(await file.arrayBuffer(), { type: "array", raw: false, cellDates: false });
  } catch {
    throw new Error("This file could not be read. Check that it is a valid .xls, .xlsx, or .csv file.");
  }

  if (!workbook.SheetNames.length) throw new Error("The workbook has no worksheets.");

  let foundHeaders = false;
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: true,
    });
    const customerRows = parseSheetRows(worksheet, rows);
    if (customerRows) {
      foundHeaders = true;
      if (customerRows.length) return customerRows;
    }
  }

  if (foundHeaders) throw new Error("The customer columns were found, but there are no customer rows below them.");
  throw new Error("Could not find customer name and phone/mobile columns in the first 100 rows of any worksheet. Check the header names and try again.");
}
