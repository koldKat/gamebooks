import re, json, sys
import xml.etree.ElementTree as ET
from collections import Counter

def load_lines(xml_path):
    tree = ET.parse(xml_path)
    root = tree.getroot()

    fontsizes = {}
    for fs in root.findall('.//fontspec'):
        fontsizes[fs.get('id')] = int(fs.get('size'))
    body_size = None
    if fontsizes:
        body_size = Counter(fontsizes.values()).most_common(1)[0][0]

    runs = []
    for page in root.findall('page'):
        pnum = int(page.get('number'))
        for t in page.findall('text'):
            width = int(t.get('width'))
            top = int(t.get('top'))
            left = int(t.get('left'))
            font = t.get('font')
            text = ''.join(t.itertext()).strip()
            is_bold = t.find('.//b') is not None
            runs.append({'page': pnum, 'top': top, 'left': left, 'width': width, 'font': font, 'bold': is_bold, 'text': text})

    lines = []
    i = 0
    while i < len(runs):
        group = [runs[i]]
        j = i + 1
        while j < len(runs) and runs[j]['page'] == runs[i]['page'] and abs(runs[j]['top'] - runs[i]['top']) <= 2:
            group.append(runs[j])
            j += 1
        left = min(g['left'] for g in group)
        right = max(g['left'] + g['width'] for g in group)
        textual = [g for g in group if g['text']]
        single_digit_runs = [g for g in textual if len(g['text']) == 1 and g['text'].isdigit()]
        if textual and all(re.match(r'^\d+$', g['text']) for g in textual) and single_digit_runs:
            # numeric-only glyph line (e.g. a decorative header number rendered via
            # multiple overlapping bold/stroke passes): trust single-digit runs first
            # (unambiguous), then fill any remaining gaps using multi-char runs (e.g.
            # "10"/"06" or a lone clean "128") via linear interpolation of their chars,
            # only where no confident single-digit run already covers that position.
            digits = []
            for g in sorted(single_digit_runs, key=lambda g: g['left']):
                if digits and digits[-1][1] == g['text'] and g['left'] - digits[-1][0] <= 6:
                    continue  # duplicate overprint pass of the same glyph
                digits.append([g['left'], g['text']])
            for g in textual:
                if len(g['text']) <= 1:
                    continue
                n = len(g['text'])
                for ci, ch in enumerate(g['text']):
                    approx_left = g['left'] + g['width'] * ci / n
                    if any(abs(approx_left - dl) <= 8 for dl, _ in digits):
                        continue
                    digits.append([approx_left, ch])
            digits.sort(key=lambda d: d[0])
            merged = []
            for dl, ch in digits:
                if merged and merged[-1][1] == ch and dl - merged[-1][0] <= 6:
                    continue
                merged.append([dl, ch])
            text = ''.join(d[1] for d in merged)
        else:
            # de-duplicate overprinted/stroke-effect runs: cluster runs whose horizontal
            # spans overlap (same glyph(s) rendered multiple times at slightly different
            # offsets/passes), keep only the widest (most complete) run per cluster.
            textual.sort(key=lambda g: g['left'])
            clusters = []
            for g in textual:
                placed = False
                for c in clusters:
                    c_left = min(x['left'] for x in c)
                    c_right = max(x['left'] + x['width'] for x in c)
                    if g['left'] < c_right and (g['left'] + g['width']) > c_left:
                        c.append(g)
                        placed = True
                        break
                if not placed:
                    clusters.append([g])
            clusters.sort(key=lambda c: min(x['left'] for x in c))
            dedup_texts = [max(c, key=lambda x: x['width'])['text'] for c in clusters]
            text = ' '.join(dedup_texts).strip()
        text = re.sub(r'\s+([.,!?…])', r'\1', text)
        bold = all(g['bold'] for g in group if g['text'])
        big_font = False
        if body_size is not None:
            sizes = [fontsizes.get(g['font']) for g in group if g['text'] and fontsizes.get(g['font']) is not None]
            if sizes and min(sizes) > body_size + 2:
                big_font = True
        lines.append({'page': group[0]['page'], 'top': group[0]['top'], 'left': left, 'width': right - left,
                       'font': group[0]['font'], 'bold': bold, 'big_font': big_font, 'text': text,
                       'n_runs': len([g for g in group if g['text']])})
        i = j

    return lines


def extract_with_headers(lines, header_positions, short_ratio=0.90):
    header_set = set(header_positions)
    body_lines = [l for i, l in enumerate(lines) if i not in header_set and l['text'] and l['width'] > 50]

    body_widths = [l['width'] for l in body_lines]
    buckets = Counter([round(w / 5) * 5 for w in body_widths])
    full_width = max(buckets, key=lambda k: buckets[k]) if buckets else (max(body_widths) if body_widths else 100)

    # some sections mix a full-width narrative column with a narrower indented
    # sidebar/dossier column (different `left`); a single global full-width makes
    # every sidebar line look "short" and falsely split. Compute a per-left-bucket
    # full-width so each column's own fill-line is judged against its own column.
    col_widths = {}
    for l in body_lines:
        col = round(l['left'] / 15) * 15
        col_widths.setdefault(col, []).append(l['width'])
    col_full_width = {}
    for col, ws in col_widths.items():
        b = Counter([round(w / 5) * 5 for w in ws])
        col_full_width[col] = max(b, key=lambda k: b[k]) if b else max(ws)

    def threshold_for(l):
        col = round(l['left'] / 15) * 15
        fw = col_full_width.get(col, full_width)
        # ignore sparse columns (few samples) where the mode is unreliable
        if len(col_widths.get(col, [])) < 3:
            fw = full_width
        return fw * short_ratio

    result = {}
    for hi, hpos in enumerate(header_positions):
        num = lines[hpos]['text'].strip().rstrip('.')
        end = header_positions[hi + 1] if hi + 1 < len(header_positions) else len(lines)
        block = lines[hpos + 1:end]
        content = [l for l in block if l['text']]
        paras = []
        cur = []
        for l in content:
            cur.append(l['text'])
            if l['width'] < threshold_for(l):
                paras.append(' '.join(cur))
                cur = []
        if cur:
            paras.append(' '.join(cur))
        result[num] = paras
    return result, full_width


def score(result, expected_ids):
    if not expected_ids:
        return len(result)
    exp = set(str(x) for x in expected_ids)
    got = set(result.keys())
    inter = exp & got
    extra = got - exp
    # reward coverage, penalize spurious extra headers
    return len(inter) - 0.5 * len(extra)


def get_paragraphs_from_xml(xml_path, expected_ids=None, short_ratio=0.90):
    lines = load_lines(xml_path)

    strategies = []
    # A: bold only, isolated pure-digit line (period optional)
    strategies.append([i for i, l in enumerate(lines) if l['bold'] and re.match(r'^\d+\.?$', l['text'])])
    # B: bold or big_font, isolated pure-digit line
    strategies.append([i for i, l in enumerate(lines) if (l['bold'] or l['big_font']) and re.match(r'^\d+\.?$', l['text'])])
    # C: any isolated pure-digit line, regardless of style (period optional)
    strategies.append([i for i, l in enumerate(lines) if re.match(r'^\d+\.?$', l['text'])])
    # D: any isolated pure-digit line requiring trailing period
    strategies.append([i for i, l in enumerate(lines) if re.match(r'^\d+\.$', l['text'])])

    best = None
    best_score = None
    best_fw = None
    for hp in strategies:
        if not hp:
            continue
        result, fw = extract_with_headers(lines, hp, short_ratio)
        s = score(result, expected_ids)
        if best_score is None or s > best_score:
            best_score = s
            best = result
            best_fw = fw

    if best is None:
        return {}, 0

    return best, best_fw


if __name__ == '__main__':
    xml_path = sys.argv[1]
    out = sys.argv[2]
    expected_ids = None
    if len(sys.argv) > 3:
        expected_ids = json.load(open(sys.argv[3], encoding='utf-8'))
    data, fw = get_paragraphs_from_xml(xml_path, expected_ids)
    json.dump(data, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
    matched = len(set(data.keys()) & set(str(x) for x in expected_ids)) if expected_ids else len(data)
    print('sections extracted:', len(data), 'matched expected:', matched, '/', len(expected_ids) if expected_ids else '?', 'full_width:', fw)
