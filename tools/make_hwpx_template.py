#!/usr/bin/env python3
"""
양식 한글 파일(.hwpx)에서 사이트의 한글(.hwpx) 내려받기에 필요한 부분을 뽑아 js/hwpx-template.js 로 저장합니다.
(글꼴·문단·테두리 스타일 header.xml, 쪽 설정, 구역 제목 배경 그림)

사용법:  python tools/make_hwpx_template.py 양식.hwpx
양식을 바꾸고 싶을 때만 다시 실행하면 됩니다.
"""
import base64
import json
import re
import sys
import zipfile
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'js' / 'hwpx-template.js'


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    z = zipfile.ZipFile(sys.argv[1])
    read = lambda n: z.read(n).decode('utf-8')

    header = read('Contents/header.xml')
    header = re.sub(r'secCnt="\d+"', 'secCnt="1"', header, count=1)

    sec = read('Contents/section0.xml')
    sec_open = re.search(r'<hs:sec [^>]*>', sec).group(0)
    # 첫 문단의 쪽 설정(secPr) + 단 설정
    sec_pr = re.search(r'<hp:secPr .*?</hp:secPr>', sec, re.S).group(0)
    col_pr = re.search(r'<hp:ctrl><hp:colPr [^>]*/></hp:ctrl>', sec).group(0)

    images = {}
    for name in z.namelist():
        if name.startswith('BinData/'):
            images[name] = base64.b64encode(z.read(name)).decode('ascii')

    data = {
        'header': header,
        'secOpen': sec_open,
        'secPr': sec_pr,
        'colPr': col_pr,
        'version': read('version.xml'),
        'images': images,
    }
    OUT.write_text('// 자동 생성 파일: tools/make_hwpx_template.py (양식 한글 파일에서 추출)\n'
                   'window.HWPX_TEMPLATE = ' + json.dumps(data, ensure_ascii=False) + ';\n', encoding='utf-8')
    print(f'저장: {OUT} ({OUT.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    main()
