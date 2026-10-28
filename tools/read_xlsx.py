"""Read the provided workbook without installing spreadsheet dependencies."""
import re
import zipfile
import xml.etree.ElementTree as ET

NS = {'x': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def read_xlsx(path):
    with zipfile.ZipFile(path) as archive:
        shared = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            root = ET.fromstring(archive.read('xl/sharedStrings.xml'))
            shared = [''.join(node.itertext()) for node in root.findall('x:si', NS)]
        root = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
    rows = []
    for row in root.findall('x:sheetData/x:row', NS):
        values = {}
        for cell in row.findall('x:c', NS):
            letters = re.match(r'[A-Z]+', cell.attrib.get('r', 'A1')).group()
            index = 0
            for letter in letters:
                index = index * 26 + ord(letter) - 64
            value = cell.find('x:v', NS)
            text = value.text or '' if value is not None else ''
            if cell.attrib.get('t') == 's':
                text = shared[int(text)]
            elif cell.attrib.get('t') == 'inlineStr':
                text = ''.join(cell.find('x:is', NS).itertext())
            values[index - 1] = text
        rows.append([values.get(i, '') for i in range(max(values, default=-1) + 1)])
    header = rows[0]
    return [dict(zip(header, row)) for row in rows[1:] if any(row)]
