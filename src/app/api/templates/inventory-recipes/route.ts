import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

function addFormula(ws: XLSX.WorkSheet, cell: string, formula: string) {
  ws[cell] = { t: "n", f: formula };
}
function canonicalQtyFormula(qty: string, unit: string) {
  const u = `LOWER(TRIM(${unit}))`;
  return `IF(${qty}="","",IF(${u}="kg",${qty}*1000,IF(${u}="mg",${qty}/1000,IF(OR(${u}="g",${u}="gm",${u}="gram",${u}="grams"),${qty},IF(OR(${u}="l",${u}="ltr",${u}="litre",${u}="liter",${u}="litres",${u}="liters"),${qty}*1000,IF(${u}="ml",${qty},IF(OR(${u}="piece",${u}="pieces",${u}="pcs",${u}="pc",${u}="each",${u}="nos",${u}="no"),${qty},"CHECK UNIT")))))))`;
}
function familyFormula(unit: string) {
  const u = `LOWER(TRIM(${unit}))`;
  return `IF(${unit}="","",IF(OR(${u}="kg",${u}="mg",${u}="g",${u}="gm",${u}="gram",${u}="grams"),"mass",IF(OR(${u}="l",${u}="ltr",${u}="litre",${u}="liter",${u}="litres",${u}="liters",${u}="ml"),"volume",IF(OR(${u}="piece",${u}="pieces",${u}="pcs",${u}="pc",${u}="each",${u}="nos",${u}="no"),"count","CHECK UNIT"))))`;
}

function workbookFor(type: string) {
  const wb = XLSX.utils.book_new();
  if (type === "ingredient") {
    const headers = ["Location Code", "Ingredient Name", "Ingredient SKU", "Base Unit", "Stock Qty", "Qty Unit", "Qty in Base Unit", "Total Cost ₹", "Average Cost / Base Unit ₹", "Reorder Level (Base Unit)", "Active", "Remarks"];
    const rows: unknown[][] = [
      headers,
      ["LOC-002", "Milk", "ING-MILK", "ml", 5, "l", null, 300, null, 1000, "Yes", "Sample — replace/delete"],
      ["LOC-002", "Sugar", "ING-SUGAR", "g", 3, "kg", null, 150, null, 500, "Yes", "Sample — replace/delete"],
    ];
    for (let i = 0; i < 248; i++) rows.push(new Array(headers.length).fill(null));
    const ws = XLSX.utils.aoa_to_sheet(rows);
    for (let row = 2; row <= 250; row++) {
      addFormula(ws, `G${row}`, canonicalQtyFormula(`E${row}`, `F${row}`));
      addFormula(ws, `I${row}`, `IF(OR(G${row}="",G${row}=0,NOT(ISNUMBER(G${row})),H${row}=""),"",H${row}/G${row})`);
    }
    ws["!cols"] = [{wch:18},{wch:28},{wch:22},{wch:14},{wch:14},{wch:14},{wch:20},{wch:16},{wch:28},{wch:26},{wch:12},{wch:30}];
    XLSX.utils.book_append_sheet(wb, ws, "Inventory Stock Update");
    return { wb, filename: "Takshvi_Inventory_Stock_Update_Template.xlsx" };
  }

  const headers = ["Location Code", "Brand Code", "Menu Item SKU", "Recipe Yield (Portions)", "Portion Size", "Portion Unit", "Portion Family", "Expected Batch Qty (Base)", "Ingredient SKU", "Quantity Used", "Qty Unit", "Ingredient Family", "Ingredient Qty (Base)", "Wastage %", "Consumption Qty incl. Wastage", "Total Recipe Qty (Base)", "Recipe Match Status", "Preparation Notes", "Active"];
  const rows: unknown[][] = [
    headers,
    ["LOC-002", "HONEYMAN-GAZEBO", "MENU-DEMO-DRINK", 1, 300, "ml", null, null, "ING-MILK", 180, "ml", null, null, 0, null, null, null, "Milk", "Yes"],
    ["LOC-002", "HONEYMAN-GAZEBO", "MENU-DEMO-DRINK", 1, 300, "ml", null, null, "ING-ESPRESSO", 30, "ml", null, null, 0, null, null, null, "Espresso", "Yes"],
    ["LOC-002", "HONEYMAN-GAZEBO", "MENU-DEMO-DRINK", 1, 300, "ml", null, null, "ING-SYRUP", 90, "ml", null, null, 2, null, null, null, "2% wastage affects stock consumption only", "Yes"],
  ];
  for (let i = 0; i < 496; i++) rows.push(new Array(headers.length).fill(null));
  const ws = XLSX.utils.aoa_to_sheet(rows);
  for (let row = 2; row <= 500; row++) {
    addFormula(ws, `G${row}`, familyFormula(`F${row}`));
    addFormula(ws, `H${row}`, `IF(OR(D${row}="",E${row}=""),"",D${row}*(${canonicalQtyFormula(`E${row}`, `F${row}`)}))`);
    addFormula(ws, `L${row}`, familyFormula(`K${row}`));
    addFormula(ws, `M${row}`, canonicalQtyFormula(`J${row}`, `K${row}`));
    addFormula(ws, `O${row}`, `IF(OR(M${row}="",NOT(ISNUMBER(M${row}))),"",M${row}*(1+N${row}/100))`);
    addFormula(ws, `P${row}`, `IF(C${row}="","",IF(COUNTIFS($A$2:$A$500,A${row},$B$2:$B$500,B${row},$C$2:$C$500,C${row},$L$2:$L$500,"<>"&G${row})>0,"",SUMIFS($M$2:$M$500,$A$2:$A$500,A${row},$B$2:$B$500,B${row},$C$2:$C$500,C${row})))`);
    addFormula(ws, `Q${row}`, `IF(C${row}="","",IF(P${row}="","MIXED UNITS - BACKEND REVIEW",IF(ABS(P${row}-H${row})<=MAX(0.01,H${row}*0.005),"MATCH","CHECK - RECIPE TOTAL <> PORTION")))`);
  }
  ws["!cols"] = [{wch:18},{wch:22},{wch:22},{wch:22},{wch:16},{wch:14},{wch:16},{wch:26},{wch:22},{wch:18},{wch:14},{wch:18},{wch:22},{wch:14},{wch:30},{wch:24},{wch:30},{wch:36},{wch:12}];
  XLSX.utils.book_append_sheet(wb, ws, "Recipe Creation");
  return { wb, filename: "Takshvi_Recipe_Creation_Template.xlsx" };
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
