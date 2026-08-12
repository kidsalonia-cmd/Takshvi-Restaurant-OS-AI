import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

function workbookFor(type: string) {
  const wb = XLSX.utils.book_new();
  if (type === "ingredient") {
    const rows = [
      ["Location Code", "Ingredient Name", "SKU", "Unit", "Opening / Current Stock", "Reorder Level", "Average Cost per Unit (INR)", "Active (Yes/No)"],
      ["SAP49", "Milk", "MILK001", "ml", 5000, 1000, 0.06, "Yes"],
      ["SAP49", "Coffee Beans", "COF001", "g", 2000, 500, 0.85, "Yes"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{wch:18},{wch:28},{wch:18},{wch:14},{wch:24},{wch:18},{wch:28},{wch:18}];
    XLSX.utils.book_append_sheet(wb, ws, "Ingredient Master");
    return { wb, filename: "Takshvi_Ingredient_Master_Template.xlsx" };
  }

  const rows = [
    ["Location Code", "Brand Code", "Menu Item SKU", "Menu Item Name", "Recipe Yield", "Ingredient SKU", "Ingredient Name", "Quantity Used", "Wastage %", "Preparation Notes", "Replace Existing Recipe (Yes/No)"],
    ["SAP49", "CAFE", "LATTE001", "Cafe Latte", 1, "MILK001", "Milk", 180, 2, "Espresso + steamed milk", "Yes"],
    ["SAP49", "CAFE", "LATTE001", "Cafe Latte", 1, "COF001", "Coffee Beans", 18, 1, "Espresso + steamed milk", "Yes"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{wch:18},{wch:16},{wch:18},{wch:28},{wch:14},{wch:18},{wch:26},{wch:18},{wch:14},{wch:34},{wch:28}];
  XLSX.utils.book_append_sheet(wb, ws, "Menu Recipes");
  return { wb, filename: "Takshvi_Menu_Recipes_Template.xlsx" };
}

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type") === "ingredient" ? "ingredient" : "recipe";
  const { wb, filename } = workbookFor(type);
  const bytes = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
