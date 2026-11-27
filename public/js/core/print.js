// Receipts and invoices: 80 / 58 mm thermal or A4, following the shop's Receipt & POS settings. The shop's own name, logo,
// address and NTN are printed (each client sees and prints its own business name, e.g. "Minha traders").
(function () {
    'use strict';
    const { html, raw } = HP;
    const S = () => (HP.session && HP.session.settings) || {};

    // after markup lands in the print root (or a preview), draw barcodes and QR codes
    function renderCodes(root) {
        root.querySelectorAll('svg[data-barcode]').forEach(svg => { try { window.JsBarcode(svg, svg.dataset.barcode, { format: 'CODE128', height: 36, width: 1.4, displayValue: false, margin: 0 }); } catch { } });
        root.querySelectorAll('[data-qr]').forEach(el => {
            try { const q = window.qrcode(0, 'M'); q.addData(el.dataset.qr); q.make(); el.innerHTML = q.createSvgTag({ cellSize: Number(el.dataset.qrCell) || 3, margin: 0 }); } catch { }
        });
    }
    HP.ui.afterPrintRender = renderCodes;

    // sale: as returned by /api/pos/sales (money in paisa); opts: { estimate, copyLabel }
    function receipt(sale, opts = {}) {
        const st = S();
        const r = { ...(st.receipt || {}) }, c = st.company || {}, n = st.numbering || {};
        const m = v => HP.fmt.money(v, { noSym: true });
        const a4 = r.paper === 'A4' || r.paper === 'STANDARD';
        const width = a4 ? 'a4' : r.width === '58' ? 'w58' : 'w80';
        const items = sale.items || [];
        const totalQty = items.reduce((s, i) => s + Number(i.qty || 0), 0);
        const savings = items.reduce((s, i) => s + Math.max(0, Number(i.mrp || 0) * Number(i.qty || 0) - Number(i.total || 0)), 0);
        const pay = (sale.payments || []);
        const shopName = c.name || (HP.session.tenant && HP.session.tenant.name) || '';
        const title = opts.estimate ? 'ESTIMATE / QUOTATION' : 'TAX INVOICE';
        const brand = r.brandColor || '#4f46e5';
        const font = a4 ? `font-family:${r.font || 'Inter'}, Arial, sans-serif;` : '';

        if (a4) {
            return html`<div class="receipt a4" style="${font}">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;border-top:6px solid ${brand};padding-top:12px">
                <div style="display:flex;gap:12px;align-items:center">${r.showLogo && c.logo ? html`<img src="${c.logo}" style="height:64px;max-width:120px;object-fit:contain" alt="">` : ''}
                  <div><div style="font-size:22px;font-weight:700">${shopName}</div><div>${c.address || ''}</div><div>${c.phone ? 'Tel: ' + c.phone : ''}${c.email ? ' · ' + c.email : ''}</div>${r.showTaxId && c.taxId ? html`<div>NTN: ${c.taxId}</div>` : ''}</div></div>
                <div style="text-align:right"><div style="font-size:20px;font-weight:700;color:${brand}">${title}</div>${opts.estimate ? '' : html`<div>Invoice # <b>${sale.number}</b></div>`}<div>Date: ${HP.fmt.dateTime(sale.date || new Date())}</div>${opts.copyLabel ? html`<div>${opts.copyLabel}</div>` : ''}</div></div>
              ${r.showCustomer ? html`<div style="margin:14px 0;padding:10px;background:#f8fafc;border-radius:6px"><b>Bill to:</b> ${sale.customerName || 'Walk-in Customer'}</div>` : ''}
              <table style="width:100%;border-collapse:collapse;margin-top:8px"><thead><tr style="background:${brand};color:#fff"><th style="text-align:left;padding:6px">#</th><th style="text-align:left;padding:6px">Item</th><th style="text-align:right;padding:6px">Qty</th><th style="text-align:right;padding:6px">Rate</th><th style="text-align:right;padding:6px">Amount</th></tr></thead>
                <tbody>${items.map((i, k) => html`<tr style="border-bottom:1px solid #e5e7eb"><td style="padding:6px">${k + 1}</td><td style="padding:6px">${i.name}${i.serial ? html`<div style="font-size:11px;color:#555">S/N ${i.serial}</div>` : ''}</td><td style="text-align:right;padding:6px">${HP.fmt.qty(i.qty)} ${i.unitName || ''}</td><td style="text-align:right;padding:6px">${m(i.price)}</td><td style="text-align:right;padding:6px">${m(i.total)}</td></tr>`)}</tbody></table>
              <div style="display:flex;justify-content:space-between;margin-top:12px;gap:24px">
                <div style="flex:1">${r.amountInWords ? html`<div><b>Amount in words:</b> ${Calc.words(sale.total)}</div>` : ''}${r.showBank && r.bankDetails ? html`<div style="margin-top:8px;white-space:pre-line"><b>Bank details:</b>\n${r.bankDetails}</div>` : ''}${r.showTerms && n.terms ? html`<div style="margin-top:8px;font-size:11px;color:#555">${n.terms}</div>` : ''}</div>
                <table style="min-width:260px">${totalsRows(sale, m, savings, r)}</table></div>
              <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:24px">${!opts.estimate ? html`<svg data-barcode="${sale.number}"></svg>` : html`<span></span>`}${r.showQr ? html`<div data-qr="${qrPayload(sale, c, r)}"></div>` : ''}${r.showSignature ? html`<div style="border-top:1px solid #000;width:180px;text-align:center;padding-top:4px">Authorised signature</div>` : ''}</div>
              <div style="text-align:center;margin-top:16px">${n.footer || ''}</div></div>`;
        }
        // the logo is a block centred with margins: the app's base styles make every <img> a block, so text-align alone
        // left it at the left edge of the paper. Width and height stay automatic, so it is never stretched.
        // (the thermal receipt prints one QR code: the WhatsApp one when the shop has a WhatsApp number, else Scan & Pay)
        return html`<div class="receipt ${width}" style="padding:4px">
            ${r.showLogo && c.logo ? html`<img src="${c.logo}" style="display:block;margin:0 auto 4px;width:auto;height:auto;max-height:64px;max-width:70%;object-fit:contain" alt="">` : ''}
            <div style="text-align:center;font-weight:700;font-size:14px">${shopName}</div>
            ${c.address ? html`<div style="text-align:center">${c.address}</div>` : ''}${c.phone ? html`<div style="text-align:center">Tel: ${c.phone}</div>` : ''}${r.showTaxId && c.taxId ? html`<div style="text-align:center">NTN: ${c.taxId}</div>` : ''}
            <div style="text-align:center;font-weight:700;margin-top:4px">${title}</div>
            <hr>${r.showCashier ? html`<div style="display:flex;justify-content:space-between"><span>Cashier</span><span>${sale.cashierName || (HP.session && HP.session.name) || ''}</span></div>` : ''}
            ${opts.estimate ? '' : html`<div style="display:flex;justify-content:space-between"><span>Bill No</span><b>${sale.number}</b></div>`}
            <div style="display:flex;justify-content:space-between"><span>Date</span><span>${HP.fmt.date(sale.date || new Date())}</span></div>
            <div style="display:flex;justify-content:space-between"><span>Time</span><span>${HP.fmt.time(sale.date || new Date())}</span></div>
            ${r.showCustomer ? html`<div style="display:flex;justify-content:space-between"><span>Customer</span><span>${sale.customerName || 'Walk-in Customer'}</span></div>` : ''}
            ${opts.copyLabel ? html`<div style="text-align:center">${opts.copyLabel}</div>` : ''}
            <hr><div style="display:flex;justify-content:space-between;font-weight:700"><span>Qty | Rate</span><span>Amount</span></div><hr>
            ${items.map((i, k) => html`<div>${k + 1}. ${i.name}${i.serial ? html` <span>(S/N ${i.serial})</span>` : ''}</div><div style="display:flex;justify-content:space-between;padding-left:10px"><span>${HP.fmt.qty(i.qty)}${i.unitName ? ' ' + i.unitName : ''} | ${m(i.price)}</span><span>${m(i.total)}</span></div>`)}
            <hr><div style="display:flex;justify-content:space-between"><span>Total Item: ${items.length}</span><span>Total Qty: ${HP.fmt.qty(totalQty)}</span></div><hr>
            <table style="width:100%">${totalsRows(sale, m, savings, r)}</table>
            ${r.amountInWords ? html`<hr><div><b>Amount in Words:</b> ${Calc.words(sale.total)}</div>` : ''}
            ${!opts.estimate && pay.length ? html`<hr>${pay.map(p => html`<div style="display:flex;justify-content:space-between"><span>${p.method === 'CASH' ? 'Cash Received' : p.method === 'CARD' ? 'Card' : 'Bank'}</span><span>${m(p.method === 'CASH' ? Number(p.amount) + Number(sale.change || 0) : p.amount)}</span></div>`)}${Number(sale.change) ? html`<div style="display:flex;justify-content:space-between"><span>Change</span><span>${m(sale.change)}</span></div>` : ''}` : ''}
            ${r.showBank && r.bankDetails ? html`<hr><div style="white-space:pre-line">${r.bankDetails}</div>` : ''}
            ${r.showTerms && n.terms ? html`<hr><div style="text-align:center">Terms & Conditions</div><div style="text-align:center">${n.terms}</div>` : ''}
            ${!opts.estimate && r.showBarcode ? html`<div style="text-align:center;margin-top:8px"><svg data-barcode="${sale.number}" style="display:block;margin:0 auto;max-width:100%"></svg><div>${sale.number}</div></div>` : ''}
            ${r.showQr && !whatsappBlock(c, r) ? html`<div style="display:flex;justify-content:center;margin-top:6px" data-qr="${qrPayload(sale, c, r)}"></div>` : ''}
            ${r.showSignature ? html`<div style="margin-top:24px;border-top:1px solid #000;text-align:center">Signature</div>` : ''}
            <div style="text-align:center;margin-top:6px">${n.footer || 'Thank you for shopping with us!'}</div>
            ${whatsappBlock(c, r)}</div>`;
    }

    // the shop's WhatsApp number in the form a wa.me link needs (923001234567), or '' when none is set
    function waDigits(c) {
        const raw = String((c || {}).whatsapp || '').trim();
        if (!raw) return '';
        const pk = HP.wa && HP.wa.number(raw);
        if (pk) return pk;
        if (!/^\s*(\+|00)/.test(raw)) return ''; // without a country code wa.me cannot open the chat
        const d = raw.replace(/\D/g, '').replace(/^00/, '');
        return d.length >= 10 && d.length <= 15 ? d : '';
    }
    // bottom of a thermal receipt: a QR code that opens a WhatsApp chat with the shop (scanned with any phone camera)
    function whatsappBlock(c, r) {
        const n = r.showWhatsappQr === false ? '' : waDigits(c);
        if (!n) return '';
        return html`<div style="text-align:center;margin-top:8px">Scan to contact us on WhatsApp</div>
            <div style="display:flex;justify-content:center;margin-top:4px" data-qr="https://wa.me/${n}" data-qr-cell="4"></div>
            <div style="text-align:center;margin-top:2px">WhatsApp: +${n}</div>`;
    }

    function totalsRows(sale, m, savings, r) {
        const row = (l, v, b) => html`<tr><td style="${b ? 'font-weight:700' : ''}">${l}</td><td style="text-align:right;${b ? 'font-weight:700' : ''}">${v}</td></tr>`;
        return html`${row('Bill Amount', m(sale.subtotal))}${Number(sale.discount) ? row('Discount', '-' + m(sale.discount)) : ''}${Number(sale.tax) ? row('Tax', m(sale.tax)) : ''}
          ${row('Net Payable', m(sale.total), true)}${Number(sale.paid) && Number(sale.due) ? row('Paid', m(sale.paid)) : ''}${Number(sale.due) ? row('Due (Udhar)', m(sale.due), true) : ''}
          ${r.showSavings && savings > 0 ? row('You saved', m(savings)) : ''}
          ${r.showPrevBalance && sale.customerId && sale.customerBalance !== undefined ? html`${row('Previous Balance', m(Number(sale.customerBalance) - Number(sale.due || 0)))}${row('Current Balance', m(sale.customerBalance), true)}` : ''}`;
    }
    const qrPayload = (sale, c, r) => (r.qrType === 'PAYMENT' ? `pay:${c.name || ''}:${(Number(sale.total) / 100).toFixed(2)}:${sale.number}` : `${c.name || 'HisabPro'} | ${sale.number} | Rs ${(Number(sale.total) / 100).toFixed(2)} | ${sale.date ? new Date(sale.date).toISOString() : ''}`);

    // print n copies (Default Print Copies setting); labels per the spec: 1 customer, 2 + merchant, 3 + logistics
    function printSale(sale, opts = {}) {
        const copies = Math.max(1, Math.min(3, Number((S().receipt || {}).copies) || 1));
        const labels = ['Customer copy', 'Merchant copy', 'Logistics copy'];
        const parts = [];
        for (let i = 0; i < (opts.estimate ? 1 : copies); i++) parts.push(html`<div style="${i ? 'page-break-before:always;' : ''}">${receipt(sale, { ...opts, copyLabel: copies > 1 ? labels[i] : '' })}</div>`);
        HP.ui.print(html`${parts}`);
    }

    // the bill's item lines for a WhatsApp message (the {items} placeholder of the bill template)
    function itemsText(sale, lang) {
        const ur = lang === 'ur';
        const rs = v => HP.wa.ltr(HP.wa.rs(v));
        const lines = (sale.items || []).map((i, k) => `${k + 1}. ${i.name}${i.serial ? ` (S/N ${i.serial})` : ''}\n${HP.wa.ltr(`${HP.fmt.qty(i.qty)}${i.unitName ? ' ' + i.unitName : ''} × ${HP.wa.rs(i.price)} = ${HP.wa.rs(i.total)}`)}`);
        const more = [];
        if (Number(sale.discount)) more.push(`${ur ? '🏷️ رعایت' : 'Discount'}: ${HP.wa.ltr('-' + HP.wa.rs(sale.discount))}`);
        if (Number(sale.tax)) more.push(`${ur ? '🧮 ٹیکس' : 'Tax'}: ${rs(sale.tax)}`);
        return [ur ? '🛒 اشیاء:' : 'Items:', ...lines, ...(more.length ? ['', `${ur ? '📋 ذیلی کل' : 'Subtotal'}: ${rs(sale.subtotal)}`, ...more] : [])].join('\n');
    }
    // the WhatsApp "Send bill" dialog with every item of the bill, not only its total
    function sendWhatsApp(sale, phone) {
        const r = v => HP.wa.ltr(HP.wa.rs(v));
        return HP.khata.sendReminder({ id: sale.customerId || null, name: sale.customerName || 'Customer', phone: phone || sale.customerPhone || '', balance: sale.customerBalance !== undefined ? sale.customerBalance : Number(sale.due || 0) },
            { kind: 'RECEIPT', refId: sale.id, extra: lang => ({ number: HP.wa.ltr(sale.number), total: r(sale.total), paid: r(sale.paid), due: r(sale.due), items: itemsText(sale, lang) }), slip: HP.native ? () => slipImage(sale) : null });
    }
    // the bill's thermal slip as a PNG picture (drawn off screen)
    async function slipImage(sale, estimate) {
        const box = document.createElement('div');
        box.style.cssText = 'position:fixed;left:-20000px;top:0';
        box.innerHTML = String(receipt(sale, { estimate }));
        document.body.appendChild(box);
        try { renderCodes(box); return await HP.native.receiptImage(box.querySelector('.receipt')); }
        finally { box.remove(); }
    }
    // a picture of the receipt (logo, items, totals) for the share sheet / clipboard
    async function sharePicture(sale, estimate) {
        const box = document.createElement('div');
        box.style.cssText = 'position:fixed;left:-20000px;top:0';
        box.innerHTML = String(receipt(sale, { estimate }));
        document.body.appendChild(box);
        try { renderCodes(box); await HP.native.shareReceipt(box.querySelector('.receipt'), sale.number || 'bill'); }
        catch (e) { HP.ui.fail(e); }
        finally { box.remove(); }
    }

    // a receipt preview inside a modal (white paper on grey)
    function preview(sale, { title, onNew, estimate, phone } = {}) {
        const m = HP.ui.modal({
            title: title || sale.number, width: 470,
            body: html`<div class="rounded-xl bg-slate-200 p-4 dark:bg-slate-800"><div class="mx-auto bg-white p-3 shadow" style="width:fit-content">${receipt(sale, { estimate })}</div></div>`,
            footer: html`${!estimate && HP.khata ? html`<button class="btn btn-outline" data-wa>${HP.icon('arrowRight')}WhatsApp</button>` : ''}${HP.native ? html`<button class="btn btn-outline me-auto" data-pic title="Share the bill as a picture">${HP.icon('image')}Picture</button>` : ''}<button class="btn btn-outline" data-print>${HP.icon('printer')}Print</button>${onNew ? html`<button class="btn btn-primary" data-new>New Sale</button>` : html`<button class="btn btn-primary" data-close>Close</button>`}`,
            onClose: onNew,
        });
        renderCodes(m.el);
        m.el.querySelector('[data-print]').addEventListener('click', () => printSale(sale, { estimate }));
        const wa = m.el.querySelector('[data-wa]');
        if (wa) wa.addEventListener('click', () => sendWhatsApp(sale, phone));
        const pic = m.el.querySelector('[data-pic]');
        if (pic) pic.addEventListener('click', async () => { pic.disabled = true; try { await sharePicture(sale, estimate); } finally { pic.disabled = false; } });
        const nb = m.el.querySelector('[data-new]'); if (nb) nb.addEventListener('click', () => m.close());
        return m;
    }

    // Payment In / Payment Out receipt (thermal width from the shop's settings): who, how much, and the party's balance
    // before and after it, so the remaining balance is never worked out by hand.
    // p: { direction IN|OUT, number, date, partyName, partyType CUSTOMER|VENDOR, partyPhone, method, accountName, reference,
    //      note, amount, balanceBefore, balance } (money in paisa; balances null when there is no party)
    function paymentReceipt(p) {
        const st = S();
        const r = st.receipt || {}, c = st.company || {}, n = st.numbering || {};
        const m = v => HP.fmt.money(v, { noSym: true });
        const width = r.width === '58' ? 'w58' : 'w80';
        const inn = p.direction === 'IN';
        const vendor = p.partyType === 'VENDOR';
        const shopName = c.name || (HP.session.tenant && HP.session.tenant.name) || '';
        const METHOD = { CASH: 'Cash', BANK: 'Bank', CARD: 'Card', WALLET: 'Wallet', CHEQUE: 'Cheque' };
        const row = (l, v, b) => html`<div style="display:flex;justify-content:space-between;gap:8px;${b ? 'font-weight:700;font-size:14px' : ''}"><span>${l}</span><span>${v}</span></div>`;
        const hasBal = p.balance !== null && p.balance !== undefined;
        const balWord = vendor ? 'Payable' : 'Receivable';
        return html`<div class="receipt ${width}" style="padding:4px">
            ${r.showLogo && c.logo ? html`<img src="${c.logo}" style="display:block;margin:0 auto 4px;width:auto;height:auto;max-height:64px;max-width:70%;object-fit:contain" alt="">` : ''}
            <div style="text-align:center;font-weight:700;font-size:14px">${shopName}</div>
            ${c.address ? html`<div style="text-align:center">${c.address}</div>` : ''}${c.phone ? html`<div style="text-align:center">Tel: ${c.phone}</div>` : ''}
            <div style="text-align:center;font-weight:700;margin-top:4px">${inn ? 'PAYMENT RECEIPT' : 'PAYMENT VOUCHER'}</div><hr>
            ${row('Receipt No', html`<b>${p.number}</b>`)}${row('Date', HP.fmt.date(p.date || new Date()))}${row('Time', HP.fmt.time(p.date || new Date()))}
            ${row(vendor ? 'Vendor' : p.partyName ? 'Customer' : inn ? 'Received from' : 'Paid to', p.partyName || (inn ? 'Other income' : 'Other payout'))}${p.partyPhone ? row('Phone', p.partyPhone) : ''}
            ${row('Method', `${METHOD[p.method] || p.method || ''}${p.accountName ? ` (${p.accountName})` : ''}`)}${p.reference ? row('Ref', p.reference) : ''}${p.note ? html`<div>Note: ${p.note}</div>` : ''}<hr>
            ${hasBal ? row(`Previous Balance (${balWord})`, m(p.balanceBefore)) : ''}
            ${row(inn ? 'Payment Received' : 'Payment Paid', m(p.amount), !hasBal)}
            ${hasBal ? html`<hr>${row(`Remaining ${balWord}`, m(p.balance), true)}${p.balance < 0 ? html`<div style="text-align:right">(${vendor ? 'advance paid to vendor' : 'advance from customer'})</div>` : ''}` : ''}
            <div style="font-size:10px;margin-top:4px">${window.Calc.words(p.amount)}</div><hr>
            <div style="margin-top:24px;border-top:1px solid #000;text-align:center;padding-top:2px">Signature</div>
            <div style="text-align:center;margin-top:6px">${n.footer || 'Thank you!'}</div></div>`;
    }
    const printPayment = p => HP.ui.print(paymentReceipt(p));
    // "Print receipt after saving" — remembered on this computer, on unless switched off
    const autoPayPrint = v => { try { if (v === undefined) return localStorage.getItem('hp.payPrint') !== '0'; localStorage.setItem('hp.payPrint', v ? '1' : '0'); } catch { return true; } };

    HP.receipt = { receipt, printSale, preview, renderCodes, whatsappBlock, waDigits, sendWhatsApp, sharePicture, itemsText, paymentReceipt, printPayment, autoPayPrint };
})();
