export const normalizeBRDate = (value?: string) => {
  if (!value) return "";

  const parts = value.match(/\d+/g);
  if (!parts || parts.length < 3) return "";

  const [dayRaw, monthRaw, yearRaw] = parts;
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  if (!day || !month || !year) return "";

  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return "";
  }

  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${String(year).padStart(4, "0")}`;
};

export const parseBRDate = (value?: string) => {
  const normalized = normalizeBRDate(value);
  if (!normalized) return null;
  const [day, month, year] = normalized.split("/").map(Number);
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date;
};

export const formatBRDate = (value?: string) => normalizeBRDate(value) || value || "";

export const brDateToInputDate = (value?: string) => {
  const normalized = normalizeBRDate(value);
  if (!normalized) return "";
  const [day, month, year] = normalized.split("/");
  return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
};

export const inputDateToBRDate = (value: string) => {
  if (!value) return "";
  const parts = value.split("-");
  if (parts.length !== 3) return "";
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
};
