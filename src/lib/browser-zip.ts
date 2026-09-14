interface ZipInputFile {
  path: string;
  blob: Blob;
}

interface PreparedZipFile {
  pathBytes: Uint8Array;
  data: Uint8Array;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const ZIP_DATE = 0;
const ZIP_TIME = 0;

let crcTable: Uint32Array | null = null;

function getCrcTable() {
  if (crcTable) return crcTable;

  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  crcTable = table;
  return table;
}

function crc32(data: Uint8Array) {
  const table = getCrcTable();
  let crc = 0xffffffff;

  for (const byte of data) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

function createLocalHeader(file: PreparedZipFile) {
  const header = new Uint8Array(30 + file.pathBytes.length);
  const view = new DataView(header.buffer);

  writeUint32(view, 0, 0x04034b50);
  writeUint16(view, 4, 20);
  writeUint16(view, 6, 0x0800);
  writeUint16(view, 8, 0);
  writeUint16(view, 10, ZIP_TIME);
  writeUint16(view, 12, ZIP_DATE);
  writeUint32(view, 14, file.crc);
  writeUint32(view, 18, file.compressedSize);
  writeUint32(view, 22, file.uncompressedSize);
  writeUint16(view, 26, file.pathBytes.length);
  writeUint16(view, 28, 0);
  header.set(file.pathBytes, 30);

  return header;
}

function createCentralDirectoryHeader(file: PreparedZipFile) {
  const header = new Uint8Array(46 + file.pathBytes.length);
  const view = new DataView(header.buffer);

  writeUint32(view, 0, 0x02014b50);
  writeUint16(view, 4, 20);
  writeUint16(view, 6, 20);
  writeUint16(view, 8, 0x0800);
  writeUint16(view, 10, 0);
  writeUint16(view, 12, ZIP_TIME);
  writeUint16(view, 14, ZIP_DATE);
  writeUint32(view, 16, file.crc);
  writeUint32(view, 20, file.compressedSize);
  writeUint32(view, 24, file.uncompressedSize);
  writeUint16(view, 28, file.pathBytes.length);
  writeUint16(view, 30, 0);
  writeUint16(view, 32, 0);
  writeUint16(view, 34, 0);
  writeUint16(view, 36, 0);
  writeUint32(view, 38, 0);
  writeUint32(view, 42, file.localHeaderOffset);
  header.set(file.pathBytes, 46);

  return header;
}

function createEndOfCentralDirectory(fileCount: number, centralDirectorySize: number, centralDirectoryOffset: number) {
  const header = new Uint8Array(22);
  const view = new DataView(header.buffer);

  writeUint32(view, 0, 0x06054b50);
  writeUint16(view, 4, 0);
  writeUint16(view, 6, 0);
  writeUint16(view, 8, fileCount);
  writeUint16(view, 10, fileCount);
  writeUint32(view, 12, centralDirectorySize);
  writeUint32(view, 16, centralDirectoryOffset);
  writeUint16(view, 20, 0);

  return header;
}

export async function createZipBlob(files: ZipInputFile[]) {
  const encoder = new TextEncoder();
  const preparedFiles: PreparedZipFile[] = [];
  const chunks: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const pathBytes = encoder.encode(file.path.replace(/\\/g, "/"));
    const preparedFile: PreparedZipFile = {
      pathBytes,
      data,
      crc: crc32(data),
      compressedSize: data.byteLength,
      uncompressedSize: data.byteLength,
      localHeaderOffset: offset,
    };
    const localHeader = createLocalHeader(preparedFile);

    preparedFiles.push(preparedFile);
    chunks.push(localHeader, data);
    offset += localHeader.byteLength + data.byteLength;
  }

  const centralDirectoryOffset = offset;
  for (const file of preparedFiles) {
    const centralDirectoryHeader = createCentralDirectoryHeader(file);
    chunks.push(centralDirectoryHeader);
    offset += centralDirectoryHeader.byteLength;
  }

  chunks.push(
    createEndOfCentralDirectory(
      preparedFiles.length,
      offset - centralDirectoryOffset,
      centralDirectoryOffset,
    ),
  );

  return new Blob(chunks as BlobPart[], { type: "application/zip" });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
