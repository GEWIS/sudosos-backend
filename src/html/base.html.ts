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

import fs from 'fs';
import path from 'path';

const bacLogo = fs.readFileSync(path.resolve(__dirname, '../../static/pdf/bac_logo.svg'), 'utf-8');

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
        html,body{height:auto;margin:0;background:var(--bg);font-family:var(--sans);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}

        .page-wrap{
            width:210mm;
            border-collapse:collapse;
            background:var(--paper);
        }

        .page-head-cell,.page-body-cell{padding:0;border:0;}
        .page-body-cell{vertical-align:top;}

        .head{display:flex;align-items:center;gap:18px;padding:var(--padding);background:linear-gradient(90deg,var(--primary),var(--primary-900));color:white;}
        .brand{display:flex;align-items:center;gap:14px}
        .brand svg{height:70px;width:70px;}
        .brand h1{font-size:18px;margin:0;letter-spacing:0.2px}
        .brand p{margin:0;font-size:12px;opacity:0.95}
        .head-right{margin-left:auto;text-align:right}
        .head-right .title{font-weight:700;font-size:16px}
        .head-right .sub{font-size:12px;opacity:0.95}

        .body{padding:26px;padding-bottom:90px;}
        .meta{display:grid;grid-template-columns:repeat(auto-fit, minmax(250px, 1fr));gap:18px;margin-bottom:18px}
        .card{background:linear-gradient(180deg, #FFFFFF, #FCFCFC);border:1px solid #EFEFEF;padding:16px;border-radius:10px}
        .card h3{margin:0 0 6px 0;font-size:13px;color:var(--muted)}
        .card p{margin:0;font-weight:600;color:var(--ink)}

        .items{width:100%;border-collapse:collapse;margin-top:10px}
        .items thead td{font-size:12px;color:var(--muted);padding:10px 12px;border-bottom:1px solid #EFEFEF}
        .items tbody td{padding:12px;font-size:13px;border-bottom:1px solid #F5F5F5}
        .items tbody tr{break-inside:avoid;page-break-inside:avoid}
        .items .qty{width:60px;text-align:center;font-family:var(--sans)}
        .items .unit{width:100px;text-align:right}
        .items .total{width:120px;text-align:right;font-weight:700}

        .totals{display:flex;justify-content:flex-end;margin-top:18px;break-inside:avoid;page-break-inside:avoid}
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
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            width: 210mm;
            box-sizing: border-box;
            z-index: 100;
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
            html,body{background:white}
        }
        @media (max-width:720px){.meta{grid-template-columns:1fr}.head-right{text-align:left;margin-top:8px}}
    </style>
</head>
<body>
<table class="page-wrap" role="document">
    <thead>
        <tr>
            <td class="page-head-cell">
                <header class="head">
                    <div class="brand">
                        <div style="height:70px;width:70px;flex-shrink:0" role="img" aria-label="SudoSOS - BAr Committee GEWIS logo">${bacLogo}</div>
                        <div>
                            <h1>${options.headerTitle}</h1>
                        </div>
                    </div>
                    <div class="head-right">
                        <div class="title">${options.headerRightTitle}</div>
                        <div class="sub">${options.headerRightSub}</div>
                    </div>
                </header>
            </td>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td class="page-body-cell">
                <main class="body">
                    <div class="meta">
                        ${options.meta}
                    </div>

                    <section aria-label="details">
                        ${options.details}
                    </section>
                </main>
            </td>
        </tr>
    </tbody>
    <tfoot>
        <tr>
            <td style="padding:0;border:0;height:90px;"></td>
        </tr>
    </tfoot>
</table>

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
</body>
</html>
`;
}
