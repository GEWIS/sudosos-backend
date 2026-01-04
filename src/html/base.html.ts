/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as published
 *  by the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 *  @license
 */


export interface IPdfBase {
  pageTitle: string;
  headerTitle: string,
  headerRightTitle: string,
  headerRightSub: string,
  meta: string,
  details: string,
  serviceEmail: string,
}

export function createBasePdf(options: IPdfBase): string {
  return `
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${options.pageTitle}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,100;0,300;0,400;0,700;0,900;1,100;1,300;1,400;1,700;1,900&display=swap" rel="stylesheet">
    <style>
        :root{
            --primary:#004b31;
            --primary-900:#074a33;
            --ink:#111111;
            --muted:#6B6B6B;
            --paper:#FFFFFF;
            --bg:#F3F3F5;
            --accent:#293065;
            --radius:10px;
            --max-width:800px;
            --padding:28px;
            --mono: "Lato", ui-monospace, Menlo, Monaco, Consolas, "Courier New", monospace;
            --sans: "Lato", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
        }
        
        @page { size: 210mm 297mm !important; margin: 0 !important; }
        html,body{height:100%;margin:0;background:var(--bg);font-family:var(--sans);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}

        .sheet{
            width:210mm;
            height:297mm;
            max-width:none;
            margin:0;
            background:var(--paper);
            border-radius:0;
            overflow:hidden;
            box-shadow:none;
            position: relative;
        }

        .head{display:flex;align-items:center;gap:18px;padding:var(--padding);background:linear-gradient(90deg,var(--primary),var(--primary-900));color:white}
        .brand{display:flex;align-items:center;gap:14px}
        .brand img{height:70px;width:70px;object-fit:cover}
        .brand h1{font-size:18px;margin:0;letter-spacing:0.2px}
        .brand p{margin:0;font-size:12px;opacity:0.95}
        .head-right{margin-left:auto;text-align:right}
        .head-right .title{font-weight:700;font-size:16px}
        .head-right .sub{font-size:12px;opacity:0.95}

        .body{padding:26px;padding-bottom:120px}
        .meta{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px}
        .card{background:linear-gradient(180deg, #FFFFFF, #FCFCFC);border:1px solid #EFEFEF;padding:16px;border-radius:10px}
        .card h3{margin:0 0 6px 0;font-size:13px;color:var(--muted)}
        .card p{margin:0;font-weight:600;color:var(--ink)}

        .items{width:100%;border-collapse:collapse;margin-top:10px}
        .items thead td{font-size:12px;color:var(--muted);padding:10px 12px;border-bottom:1px solid #EFEFEF}
        .items tbody td{padding:12px;font-size:13px;border-bottom:1px solid #F5F5F5}
        .items .qty{width:60px;text-align:center;font-family:var(--sans)}
        .items .unit{width:100px;text-align:right}
        .items .total{width:120px;text-align:right;font-weight:700}

        .totals{display:flex;justify-content:flex-end;margin-top:18px}
        .totals table{border-collapse:collapse;width:320px}
        .totals td{padding:8px 12px}
        .totals .label{color:var(--muted);font-size:13px}
        .totals .amt{font-weight:700;text-align:right}
        .grand{font-size:18px;color:var(--accent)}

        .foot {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            flex-wrap: wrap;
            padding: 18px 26px;
            background: #FFFFFF;
            border-top: 1px solid #F0F0F0;
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
        }

        .foot > div {
            max-width: 48%; /* prevent overflowing */
        }

        .foot div[style*="text-align:right"] {
            text-align: right;
        }


        .contact{font-size:12px;color:var(--muted)}
        .contact a{color:var(--primary);text-decoration:none;font-weight:600}
        .small{font-size:11px;color:#8A8A8A;margin-top:12px}

        @media print{
            body{background:white}
            .sheet{box-shadow:none;margin:0;border-radius:0}
        }
        @media (max-width:720px){.sheet{margin:18px}.meta{grid-template-columns:1fr}.head-right{text-align:left;margin-top:8px}}
    </style>
</head>
<body>
<div class="sheet" role="document">
    <header class="head">
        <div class="brand">
            <img src="data:image/gif;base64,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" alt="Logo" />
            <div>
                <h1>${options.headerTitle}</h1>
            </div>
        </div>
        <div class="head-right">
            <div class="title">${options.headerRightTitle}</div>
            <div class="sub">${options.headerRightSub}</div>
        </div>
    </header>

    <main class="body">
        <div class="meta">
            ${options.meta}
        </div>

        <section aria-label="details">
            ${options.details}
        </section>
    </main>

    <footer class="foot">
        <div>
            <div class="contact">Service: <a href="mailto:${options.serviceEmail}">${options.serviceEmail}</a></div>
            <div class="small">Tel: <a href="tel:+31402472815">+31 40 247 2815</a></div>
        </div>
        <div style="text-align:right">
            <div style="font-weight:700"> SudoSOS - BAr Committee GEWIS</div>
            <div class="small">Study Association GEWIS, MF 3.155, Groene Loper 5, 5612 AE Eindhoven, Nederland</div>
        </div>
    </footer>
</div>
</body>
</html>
`;
}
