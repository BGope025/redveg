export type ImportedCustomerRow = {
  rowNumber: number;
  name: string;
  phone: string;
  address?: string;
  locality?: string;
  pincode?: string;
  notes?: string;
};

const HEADER_ALIASES: Record<string, keyof Omit<ImportedCustomerRow, "rowNumber">> = {
  name: "name", customer: "name", customername: "name", fullname: "name",
  phone: "phone", mobile: "phone", mobileno: "phone", mobilenumber: "phone", phonenumber: "phone", contact: "phone",
  address: "address", addressline: "address", fulladdress: "address", locality: "locality", area: "locality",
  pincode: "pincode", postalcode: "pincode", zipcode: "pincode", notes: "notes", note: "notes",
};

function normalizeHeader(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
}

function findEndOfCentralDirectory(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("This file is not a readable .xlsx workbook.");
}

async function readZipEntry(bytes: Uint8Array, entryOffset: number, expectedName: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(entryOffset, true) !== 0x02014b50) throw new Error("The workbook archive is damaged.");
  const method = view.getUint16(entryOffset + 10, true);
  const compressedSize = view.getUint32(entryOffset + 20, true);
  const nameLength = view.getUint16(entryOffset + 28, true);
  const extraLength = view.getUint16(entryOffset + 30, true);
  const commentLength = view.getUint16(entryOffset + 32, true);
  const localOffset = view.getUint32(entryOffset + 42, true);
  const actualName = new TextDecoder().decode(bytes.slice(entryOffset + 46, entryOffset + 46 + nameLength));
  if (actualName !== expectedName || view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("The workbook sheet could not be opened.");
  const localNameLength = view.getUint16(localOffset + 26, true);
  const localExtraLength = view.getUint16(localOffset + 28, true);
  const start = localOffset + 30 + localNameLength + localExtraLength;
  const compressed = bytes.slice(start, start + compressedSize);
  if (method === 0) return new TextDecoder().decode(compressed);
  if (method !== 8 || typeof DecompressionStream === "undefined") throw new Error("This browser cannot read compressed Excel workbooks. Try a modern browser or save the sheet as CSV.");
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat));
  return new Response(stream).text();
}

function parseXml(xml: string) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("The Excel workbook contains invalid XML.");
  return doc;
}

function columnIndex(reference: string) {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() || "A";
  return Array.from(letters).reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function normalizeTarget(base: string, target: string) {
  const path = target.startsWith("/") ? target.slice(1) : `${base}/${target}`;
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

export async function parseCustomerWorkbook(file: File): Promise<ImportedCustomerRow[]> {
  if (file.size > 20 * 1024 * 1024) throw new Error("Choose an Excel file smaller than 20 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findEndOfCentralDirectory(bytes);
  const totalEntries = view.getUint16(end + 10, true);
  const centralStart = view.getUint32(end + 16, true);
  const entries = new Map<string, number>();
  let cursor = centralStart;
  for (let index = 0; index < totalEntries; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error("The workbook archive is damaged.");
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const name = new TextDecoder().decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    entries.set(name, cursor);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  const readEntry = async (name: string) => {
    const offset = entries.get(name);
    if (offset === undefined) throw new Error(`Missing workbook data: ${name}`);
    return readZipEntry(bytes, offset, name);
  };
  const workbook = parseXml(await readEntry("xl/workbook.xml"));
  const firstSheet = workbook.getElementsByTagName("sheet")[0];
  if (!firstSheet) throw new Error("The workbook has no worksheets.");
  const relationId = firstSheet.getAttribute("r:id");
  const rels = parseXml(await readEntry("xl/_rels/workbook.xml.rels"));
  const relation = Array.from(rels.getElementsByTagName("Relationship")).find((item) => item.getAttribute("Id") === relationId);
  if (!relation?.getAttribute("Target")) throw new Error("The first worksheet could not be located.");
  const sheetPath = normalizeTarget("xl", relation.getAttribute("Target")!);
  const sheet = parseXml(await readEntry(sheetPath));
  const sharedStrings = entries.has("xl/sharedStrings.xml")
    ? Array.from(parseXml(await readEntry("xl/sharedStrings.xml")).getElementsByTagName("si")).map((item) =>
      Array.from(item.getElementsByTagName("t")).map((text) => text.textContent || "").join(""))
    : [];
  const sheetRows = Array.from(sheet.getElementsByTagName("row"));
  if (sheetRows.length < 2) throw new Error("Add a header row and at least one customer to the first worksheet.");
  const cellValue = (cell: Element) => {
    const type = cell.getAttribute("t");
    if (type === "inlineStr") return Array.from(cell.getElementsByTagName("t")).map((item) => item.textContent || "").join("");
    const value = cell.getElementsByTagName("v")[0]?.textContent || "";
    return type === "s" ? sharedStrings[Number(value)] || "" : value;
  };
  const headerCells = Array.from(sheetRows[0].getElementsByTagName("c"));
  const headers = new Map<number, keyof Omit<ImportedCustomerRow, "rowNumber">>();
  for (const cell of headerCells) {
    const target = HEADER_ALIASES[normalizeHeader(cellValue(cell))];
    if (target) headers.set(columnIndex(cell.getAttribute("r") || "A"), target);
  }
  const headerValues = Array.from(headers.values());
  if (!headerValues.includes("name") || !headerValues.includes("phone")) {
    throw new Error("The first row must include Name and Mobile/Phone column headers.");
  }
  return sheetRows.slice(1).map((row, index) => {
    const values: Partial<ImportedCustomerRow> = { rowNumber: index + 2 };
    for (const cell of Array.from(row.getElementsByTagName("c"))) {
      const key = headers.get(columnIndex(cell.getAttribute("r") || "A"));
      if (key) values[key] = cellValue(cell).trim();
    }
    return values as ImportedCustomerRow;
  }).filter((row) => row.name || row.phone || row.address || row.locality || row.pincode);
}
