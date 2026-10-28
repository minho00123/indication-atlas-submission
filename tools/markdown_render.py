"""Small build-time renderer for the Markdown subset used by submission docs.

Raw HTML is escaped; only http(s), local files and hash links are accepted.
"""
import html
import re


def inline(text):
    text = html.escape(text)
    text = re.sub(r'`([^`]+)`', r'<code>\1</code>', text)
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    def link(match):
        title, url = match.groups()
        if not (url.startswith(('https://','http://','#','./','../')) or re.match(r'^[A-Za-z_][\w./-]*$',url)):
            return title
        extra = ' target="_blank" rel="noopener noreferrer"' if url.startswith(('https://','http://')) else ''
        return f'<a href="{url}"{extra}>{title}</a>'
    return re.sub(r'\[([^\]]+)\]\(([^\s)]+)\)', link, text)


def render(text):
    lines = text.splitlines()
    out = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1; continue
        if line.startswith('```'):
            code=[]; i+=1
            while i<len(lines) and not lines[i].strip().startswith('```'):
                code.append(lines[i]);i+=1
            out.append('<pre><code>'+html.escape('\n'.join(code))+'</code></pre>');i+=1;continue
        heading=re.match(r'^(#{1,6})\s+(.+)$',line)
        if heading:
            level=len(heading[1]);out.append(f'<h{level}>'+inline(heading[2])+f'</h{level}>');i+=1;continue
        if line.startswith('|'):
            rows=[]
            while i<len(lines) and lines[i].strip().startswith('|'):
                cells=[c.strip() for c in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-{2,}:?',c.replace(' ','')) for c in cells):rows.append(cells)
                i+=1
            out.append('<div class="table-scroll"><table><thead><tr>'+''.join('<th>'+inline(c)+'</th>' for c in rows[0])+'</tr></thead><tbody>')
            out.extend('<tr>'+''.join('<td>'+inline(c)+'</td>' for c in row)+'</tr>' for row in rows[1:])
            out.append('</tbody></table></div>');continue
        # "!> " lines form the key-point summary shown before the detailed text.
        if line.startswith('!> '):
            points=[]
            while i<len(lines) and lines[i].strip().startswith('!> '):
                points.append(lines[i].strip()[3:]);i+=1
            out.append('<aside class="doc-summary" aria-label="핵심 요약"><p class="doc-summary-label">핵심 요약</p><ul>'+''.join('<li>'+inline(p)+'</li>' for p in points)+'</ul></aside>');continue
        if line.startswith('>'):
            quote=[]
            while i<len(lines) and lines[i].strip().startswith('>'):
                quote.append(lines[i].strip()[1:].strip());i+=1
            out.append('<blockquote><p>'+inline(' '.join(quote))+'</p></blockquote>');continue
        if re.match(r'^([-*]|\d+\.)\s+',line):
            ordered=bool(re.match(r'^\d+\.',line));tag='ol' if ordered else 'ul';out.append('<'+tag+'>')
            while i<len(lines) and re.match(r'^([-*]|\d+\.)\s+',lines[i].strip()):
                out.append('<li>'+inline(re.sub(r'^([-*]|\d+\.)\s+','',lines[i].strip()))+'</li>');i+=1
            out.append('</'+tag+'>');continue
        if line in ('---','***'):
            out.append('<hr>');i+=1;continue
        paragraph=[line];i+=1
        while i<len(lines) and lines[i].strip() and not re.match(r'^(#|\||>|```|[-*]\s|\d+\.\s)',lines[i].strip()):
            paragraph.append(lines[i].strip());i+=1
        out.append('<p>'+inline(' '.join(paragraph))+'</p>')
    return '\n'.join(out)
