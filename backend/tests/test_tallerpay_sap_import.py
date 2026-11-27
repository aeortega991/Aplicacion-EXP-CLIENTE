"""Pruebas de equivalencia entre SAP XML SpreadsheetML y XLSX convertido."""
import io
import asyncio
import unittest
from datetime import datetime
from openpyxl import Workbook
from tallerpay.sap_import import parse_sap_xlsx, parse_sap_file, parse_sap_xml, preview_summary, SS_NS, create_sap_router
from fastapi import UploadFile, HTTPException


def make_rows():
    header = [""] * 29
    header[1], header[3], header[8] = "Ticket", "Estado", "Fecha de solución"
    a = [""] * 29
    a[1] = "Instalación comercial"
    a[2] = "1435400"
    a[3] = "Cerrado"
    a[8] = "14.10.2026"
    a[11] = "COMERCIAL KYWI S.A"
    a[12] = "FACTURADO"
    a[13] = "14.10.2026"
    a[18] = "INSTALACION NIVEL 1"
    a[20] = "CESAR FERNANDO"
    a[21] = "8000000147"
    a[22] = "Sin asignar"
    a[23] = "SG04AEAD02"
    a[26] = "Ruta Foránea"
    return header, a


class SAPXLSXTests(unittest.TestCase):
    def xlsx(self, original=True):
        wb = Workbook()
        ws = wb.active
        ws.title = "SAP exportado"
        if original:
            ws.append(["INDURAMA INDICADORES"])
            ws.append(["Enviados a", "26.11.2026"])
        header, a = make_rows()
        ws.append(header)
        ws.append(a)
        output = io.BytesIO()
        wb.save(output)
        return output.getvalue()

    def xml(self):
        from xml.sax.saxutils import escape
        header, a = make_rows()
        def row(vals):
            cells = "".join(f'<Cell ss:Index="{i}"><Data ss:Type="String">{escape(v)}</Data></Cell>'
                            for i, v in enumerate(vals,1) if v)
            return f"<Row>{cells}</Row>"
        return (f'<?xml version="1.0"?><Workbook xmlns="{SS_NS}" xmlns:ss="{SS_NS}">'
                f'<Worksheet ss:Name="SAP"><Table>{row(header)}{row(a)}</Table></Worksheet></Workbook>').encode()

    def test_xlsx_detects_headers_and_fields(self):
        result = parse_sap_xlsx(self.xlsx())
        self.assertEqual(len(result["tickets"]), 1)
        self.assertEqual(result["errores"], [])
        ticket = result["tickets"][0]
        self.assertEqual(ticket["ticket_id"], "1435400")
        self.assertEqual(ticket["fecha_solucion"], "2026-10-14")
        self.assertEqual(ticket["codigo_act"], "SG04AEAD02")
        self.assertTrue(ticket["facturado"])
        self.assertTrue(ticket["es_foraneo"])
        self.assertEqual(preview_summary(result)["periodos"], {"2026-10": 1})

    def test_xml_and_xlsx_equivalent(self):
        a = parse_sap_file(self.xlsx(False), "sap.xlsx")["tickets"][0]
        b = parse_sap_file(self.xml(), "sap.xml")["tickets"][0]
        self.assertEqual({k:v for k,v in a.items() if k!="fila_origen"},
                         {k:v for k,v in b.items() if k!="fila_origen"})

    def test_duplicate_in_xlsx(self):
        wb = Workbook()
        ws = wb.active
        h, a = make_rows()
        ws.append(h)
        ws.append(a)
        ws.append(a)
        buf = io.BytesIO()
        wb.save(buf)
        result = parse_sap_xlsx(buf.getvalue())
        self.assertEqual(len(result["tickets"]), 1)
        self.assertEqual(len(result["errores"]), 1)

    def test_invalid_start_date_is_warning_not_error(self):
        wb = Workbook()
        ws = wb.active
        header, row = make_rows()
        row[28] = "#"
        ws.append(header)
        ws.append(row)
        out = io.BytesIO()
        wb.save(out)
        result = parse_sap_xlsx(out.getvalue())
        self.assertEqual(result["errores"], [])
        self.assertEqual(len(result["tickets"]), 1)
        self.assertIsNone(result["tickets"][0]["inicio_prometida"])
        self.assertEqual(result["tickets"][0]["inicio_prometida_original"], "#")
        summary = preview_summary(result)
        self.assertEqual(summary["total_advertencias"], 1)
        self.assertEqual(summary["total_validos"], 1)

    def test_confirmation_calls_same_xml_xlsx_reader_as_preview(self):
        # Regresión: el POST de confirmación llamaba antes a read_xml,
        # función inexistente tras añadir soporte XLSX.
        async def fake_current_user():
            return {"role": "admin"}
        async def fake_perms(user):
            return {}
        router, _ = create_sap_router(object(), fake_current_user, fake_perms)
        preview = next(x.endpoint for x in router.routes if x.path == "/sap/preview")
        confirm = next(x.endpoint for x in router.routes if x.path == "/sap/import")
        async def call_bad(endpoint):
            file = UploadFile(filename="invalido.csv", file=io.BytesIO(b"not excel"))
            try:
                await endpoint(file=file, user={"role": "admin"})
            finally:
                await file.close()
        for action in (preview, confirm):
            with self.subTest(endpoint=action.__name__):
                with self.assertRaises(HTTPException) as ctx:
                    asyncio.run(call_bad(action))
                self.assertEqual(ctx.exception.status_code, 400)

    def test_reject_unsupported_extension(self):
        with self.assertRaises(ValueError):
            parse_sap_file(self.xlsx(), "sap.csv")

    def test_date_cells(self):
        wb = Workbook()
        ws = wb.active
        h,a = make_rows()
        a[8] = datetime(2026,10,14)
        a[13] = datetime(2026,10,14)
        ws.append(h)
        ws.append(a)
        buf = io.BytesIO()
        wb.save(buf)
        self.assertEqual(parse_sap_xlsx(buf.getvalue())["tickets"][0]["fecha_solucion"], "2026-10-14")


if __name__ == "__main__":
    unittest.main()
