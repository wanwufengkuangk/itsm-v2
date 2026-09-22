export type Sheet = { name: string; rows: unknown[][] };
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_ROWS = 50000;

export async function readWorkbook(file: File): Promise<Sheet[]> {
  if (!/\.xlsx$/i.test(file.name))
    throw new Error(
      "请选择 .xlsx 文件；旧版 .xls 请先在 Excel 中另存为 .xlsx。",
    );
  if (file.size > MAX_FILE_BYTES)
    throw new Error("单文件上限 20 MB，请拆分导出后导入。");
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  return workbook.worksheets.map((sheet) => {
    if (sheet.rowCount > MAX_ROWS + 20)
      throw new Error(
        `工作表“${sheet.name}”超过 50,000 行上限，请缩小导出范围。`,
      );
    if (sheet.columnCount > 300)
      throw new Error("工作表超过 300 列，请仅保留业务数据区域。");
    const rows: unknown[][] = [];
    for (let rowNo = 1; rowNo <= sheet.rowCount; rowNo++) {
      const values: unknown[] = [];
      for (let col = 1; col <= sheet.columnCount; col++) {
        const value = sheet.getRow(rowNo).getCell(col).value;
        if (value instanceof Date)
          values.push(value.toISOString().slice(0, 19));
        else if (typeof value === "object" && value !== null) {
          if ("formula" in value || "sharedFormula" in value) values.push(null);
          else if ("richText" in value)
            values.push(value.richText.map((v) => v.text).join(""));
          else if ("text" in value) values.push(value.text);
          else values.push(null);
        } else values.push(value);
      }
      rows.push(values);
    }
    return { name: sheet.name, rows };
  });
}
export function records(sheet: Sheet, headerRow: number) {
  const headers = (sheet.rows[headerRow - 1] ?? []).map((v) =>
    String(v ?? "").trim(),
  );
  const named = headers.filter(Boolean);
  if (!named.length) throw new Error("所选表头行没有字段名。");
  if (new Set(named).size !== named.length)
    throw new Error("表头含重复列名，请在 Excel 中改为唯一列名后重新导入。");
  const rows = sheet.rows
    .slice(headerRow)
    .map((values, i) => ({
      ...Object.fromEntries(
        headers.flatMap((h, j) => (h ? [[h, values[j] ?? null]] : [])),
      ),
      __sourceRow: headerRow + i + 1,
    }));
  if (rows.length > MAX_ROWS)
    throw new Error("数据超过 50,000 行上限，请缩小导出范围。");
  return { headers: named, rows };
}
export function download(
  name: string,
  content: string,
  type = "text/csv;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
