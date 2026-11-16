import type { Locale } from '../notification-channel';

/** The logo PNG served by garage-web (apps/garage-web/public). Mail apps do not show SVG. */
export const EMAIL_LOGO_PATH = '/email-logo.png';

const BUTTON = { en: 'Open the link', ar: 'افتح الرابط' };
const FOOTER = {
  en: 'Gearva · Keep you moving',
  ar: 'Gearva · Keep you moving',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const URL_ONLY = /^https?:\/\/\S+$/;

/**
 * The HTML part of every email (step 6.5c): the Gearva logo and name on top, then the
 * same words as the plain-text part, paragraph by paragraph. A line that is only a link
 * (the set-password links) becomes an orange button with the address under it, for
 * copying. Arabic is right to left. Inline styles and tables only, for mail apps.
 * Everything from the text is escaped: names come from staff input.
 */
export function emailHtml(
  email: { subject: string; text: string },
  locale: Locale,
  appUrlGarage: string,
): string {
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const align = locale === 'ar' ? 'right' : 'left';
  const logo = new URL(EMAIL_LOGO_PATH, appUrlGarage).toString();

  const blocks = email.text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n');
      return lines
        .map((line) => {
          const trimmed = line.trim();
          if (URL_ONLY.test(trimmed)) {
            const href = escapeHtml(trimmed);
            return (
              `<p style="margin:16px 0 4px"><a href="${href}" style="display:inline-block;background:#ff600f;color:#ffffff;` +
              `text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">${BUTTON[locale]}</a></p>` +
              `<p dir="ltr" style="margin:0 0 12px;font-size:12px;color:#55605e;word-break:break-all;text-align:${align}">` +
              `<a href="${href}" style="color:#bf4300">${href}</a></p>`
            );
          }
          return `<p style="margin:0 0 12px">${escapeHtml(line)}</p>`;
        })
        .join('');
    })
    .join('');

  return `<!doctype html>
<html lang="${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(email.subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f2ee">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ee">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid #ddd8d0">
<tr><td dir="ltr" style="padding:20px 24px;border-bottom:3px solid #ff600f">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle"><img src="${logo}" width="48" height="42" alt="Gearva" style="display:block;border:0"></td>
<td style="vertical-align:middle;padding-left:12px;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:800;color:#101a19;letter-spacing:.5px">GEAR<span style="color:#ff600f">VA</span></td>
</tr></table>
</td></tr>
<tr><td dir="${dir}" style="padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#101a19;text-align:${align}">
${blocks}
</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #ddd8d0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#55605e;text-align:center">${FOOTER[locale]}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
