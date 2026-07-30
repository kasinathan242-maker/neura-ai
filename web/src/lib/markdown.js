/**
 * Minimal markdown renderer for model output.
 *
 * Purpose-built rather than pulling in a parser: the output we render is a known
 * subset (headings, lists, fences, inline emphasis, links), and this keeps the
 * bundle small while escaping HTML *before* any formatting is applied -- so model
 * output can never inject markup.
 */

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function inline(text) {
    return escapeHtml(text)
        .replace(/`([^`\n]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
        // Underscore emphasis, anchored to word boundaries so snake_case
        // identifiers in model output are not mangled into italics.
        .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s.,;:!?)])/g, '$1<em>$2</em>')
        .replace(
            /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
            '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
        );
}

export function renderMarkdown(source) {
    const lines = String(source ?? '').replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let listType = null;
    let inFence = false;
    let fenceLines = [];

    const closeList = () => {
        if (listType) {
            out.push(listType === 'ul' ? '</ul>' : '</ol>');
            listType = null;
        }
    };

    for (const line of lines) {
        const fence = line.match(/^\s*```(\w*)\s*$/);
        if (fence) {
            if (inFence) {
                out.push(`<pre><code>${escapeHtml(fenceLines.join('\n'))}</code></pre>`);
                fenceLines = [];
                inFence = false;
            } else {
                closeList();
                inFence = true;
            }
            continue;
        }

        if (inFence) {
            fenceLines.push(line);
            continue;
        }

        if (!line.trim()) {
            closeList();
            continue;
        }

        const heading = line.match(/^(#{1,4})\s+(.*)$/);
        if (heading) {
            closeList();
            const level = Math.min(3, heading[1].length);
            out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
            continue;
        }

        if (/^\s*(?:[-*_]\s*){3,}$/.test(line)) {
            closeList();
            out.push('<hr />');
            continue;
        }

        const quote = line.match(/^>\s?(.*)$/);
        if (quote) {
            closeList();
            out.push(`<blockquote>${inline(quote[1])}</blockquote>`);
            continue;
        }

        const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
        if (bullet) {
            if (listType !== 'ul') {
                closeList();
                out.push('<ul>');
                listType = 'ul';
            }
            out.push(`<li>${inline(bullet[1])}</li>`);
            continue;
        }

        const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
        if (numbered) {
            if (listType !== 'ol') {
                closeList();
                out.push('<ol>');
                listType = 'ol';
            }
            out.push(`<li>${inline(numbered[1])}</li>`);
            continue;
        }

        closeList();
        out.push(`<p>${inline(line)}</p>`);
    }

    // An unterminated fence is normal mid-stream; render what we have.
    if (inFence && fenceLines.length) {
        out.push(`<pre><code>${escapeHtml(fenceLines.join('\n'))}</code></pre>`);
    }
    closeList();

    return out.join('\n');
}

export default renderMarkdown;
