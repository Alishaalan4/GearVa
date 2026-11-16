// Step 6.5c: the HTML part of the emails (logo, paragraphs, link button, Arabic, escaping).
import { emailHtml } from '../src/notifications/templates/email-html';
import { renderEmail } from '../src/notifications/templates';

const APP = 'https://gearva.online';

describe('emailHtml', () => {
  it('has the logo, the same paragraphs, and the link as a button', () => {
    const email = renderEmail('owner-invite', 'en', {
      name: 'Sara',
      garageName: 'Haddad Auto',
      link: 'https://gearva.online/en/owner/set-password?token=abc',
    });
    const html = emailHtml(email, 'en', APP);
    expect(html).toContain('<img src="https://gearva.online/email-logo.png"');
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('<p style="margin:0 0 12px">Hello Sara,</p>');
    expect(html).toContain('href="https://gearva.online/en/owner/set-password?token=abc"');
    expect(html).toContain('>Open the link</a>');
    expect(html).toContain(`<title>${email.subject}</title>`);
  });

  it('Arabic is right to left, with the Arabic button', () => {
    const email = renderEmail('owner-invite', 'ar', {
      name: 'سارة',
      garageName: 'كراج حداد',
      link: 'https://gearva.online/ar/owner/set-password?token=abc',
    });
    const html = emailHtml(email, 'ar', APP);
    // Only the text is right to left; the frame stays centred (a dir on <html> moves it).
    expect(html).toContain('<html lang="ar">');
    expect(html).toContain('<td dir="rtl"');
    expect(html).toContain('text-align:right');
    expect(html).toContain('>افتح الرابط</a>');
  });

  it('escapes what staff typed (names), so no HTML can be injected', () => {
    const html = emailHtml(
      { subject: 'Hi', text: 'Hello <script>alert(1)</script> & "you"' },
      'en',
      APP,
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('Hello &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;you&quot;');
  });

  it('every template renders to HTML in both languages', () => {
    const samples: Record<string, object> = {
      'staff-invite': { name: 'Sam', garageName: 'G', link: `${APP}/set-password?token=x` },
      'password-reset': { name: 'Sam', link: `${APP}/set-password?token=x`, hours: 24 },
      'owner-invite': {
        name: 'Sam',
        garageName: 'G',
        link: `${APP}/en/owner/set-password?token=x`,
      },
      'service-reminder': {
        customerName: 'Sam',
        garageName: 'G',
        vehicle: 'Kia Rio',
        plate: 'B 1',
        serviceName: 'Oil change',
        dueKm: 50000,
        unit: 'KM',
        dueDate: '2027-01-01',
      },
      'warranty-end': {
        customerName: 'Sam',
        garageName: 'G',
        vehicle: 'Kia Rio',
        plate: 'B 1',
        serviceName: 'Battery',
        dueDate: '2027-01-01',
      },
      'recommended-next': {
        customerName: 'Sam',
        garageName: 'G',
        vehicle: 'Kia Rio',
        plate: 'B 1',
        serviceName: 'Brakes',
        dueDate: '2027-01-01',
      },
      'monthly-reminder': { customerName: 'Sam', garageName: 'G' },
    };
    for (const [name, data] of Object.entries(samples)) {
      for (const locale of ['en', 'ar'] as const) {
        const html = emailHtml(renderEmail(name, locale, data), locale, APP);
        expect(html).toContain('email-logo.png');
        expect(html).toContain('Sam');
      }
    }
  });
});
