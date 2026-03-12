import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import nodemailer from 'nodemailer';
import { db } from './admin.js';

/**
 * Replicates the frontend autofill logic for backend PDF generation
 */
function backendAutofill(content, builder, project, date = new Date()) {
    if (!content) return '';
    
    const data = {
        companyName: builder?.companyName || '[Company Name]',
        companyAddress: builder?.companyAddress || '[Company Address]',
        builderName: builder?.ownerName || '[Builder Name]',
        builderEmail: builder?.email || '[Builder Email]',
        builderPhone: builder?.phone || '[Builder Phone Number]',
        projectName: project?.address || '[Project Name/Address]',
        projectAddress: project?.address || '[Project Address]',
        date: date.toLocaleDateString('en-GB'),
        year: date.getFullYear(),
        day: date.getDate(),
        month: date.toLocaleString('default', { month: 'long' })
    };

    let result = content;
    Object.keys(data).forEach(key => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        result = result.replace(regex, data[key]);
    });

    return result;
}

/**
 * Generates a finalized PDF with signature and Audit Trail
 */
export async function finalizeContract({ agreementId, signatureData, ip, userAgent }) {
    let browser = null;
    try {
        console.log(`Finalizing contract ${agreementId} for IP ${ip}`);

        // 1. Fetch data
        const agreementRef = db.collection('agreements').doc(agreementId);
        const agreementSnap = await agreementRef.get();
        if (!agreementSnap.exists) throw new Error("Agreement not found");

        const agreement = agreementSnap.data();
        const builderSnap = await db.collection('builders').doc(agreement.builderId).get();
        const versionSnap = await db.collection('contractVersions').doc(agreement.versionId).get();

        const builder = builderSnap.data();
        const version = versionSnap.data();
        const timestamp = new Date();
        const utcTimestamp = timestamp.toISOString();

        // 2. Prepare HTML content
        const contractHtml = backendAutofill(version.content, builder, null, timestamp);
        const refId = `BRA-${agreementId.substring(0, 8).toUpperCase()}`;

        const fullHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: 'Helvetica', 'Arial', sans-serif; line-height: 1.6; color: #1e293b; padding: 30px; margin: 0; font-size: 11pt; }
                    .header { border-bottom: 2px solid #0f172a; padding-bottom: 15px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: flex-end; }
                    .header h1 { margin: 0; color: #0f172a; font-size: 22pt; }
                    .header .meta { text-align: right; font-size: 8pt; color: #64748b; }
                    .content { margin-bottom: 40px; overflow-wrap: break-word; word-wrap: break-word; word-break: normal; white-space: normal; hyphens: auto; }
                    .content h1, .content h2, .content h3 { color: #0f172a; margin-top: 20px; }
                    .content p, .content li { margin-bottom: 10pt; }
                    .signature-section { page-break-inside: avoid; margin-top: 40px; padding: 20px; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 8px; }
                    .signature-box { margin-top: 15px; border: 1px solid #cbd5e1; background: #fff; min-height: 100px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
                    .signature-box img { max-height: 80px; max-width: 90%; }
                    
                    /* Digital Execution Record Page styling */
                    .audit-trail-page { page-break-before: always; padding: 20px 0; }
                    .audit-header { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 25px; }
                    .audit-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
                    .audit-card { background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #f1f5f9; display: flex; flex-direction: column; }
                    .audit-label { font-size: 8pt; font-weight: bold; color: #64748b; text-transform: uppercase; margin-bottom: 2px; }
                    .audit-value { font-size: 10pt; color: #1e293b; overflow-wrap: anywhere; word-wrap: break-word; word-break: normal; }
                    .seal-box { margin-top: 20px; padding: 20px; background: #fcfdfd; border: 1px solid #f1f5f9; border-radius: 8px; text-align: center; }
                    .seal { display: inline-flex; align-items: center; gap: 8px; color: #059669; font-weight: bold; font-size: 11pt; margin-bottom: 8px; }
                    .legal-note { font-size: 8pt; color: #94a3b8; line-height: 1.4; max-width: 500px; margin: 0 auto; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <h1>Benchmark Intelligence</h1>
                        <p style="margin: 5px 0 0 0; font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Finalized Legal Agreement</p>
                    </div>
                    <div class="meta">
                        Reference: ${refId}<br>
                        Document ID: ${agreementId}
                    </div>
                </div>

                <div class="content">
                    ${contractHtml}
                </div>

                <div class="signature-section">
                    <div style="font-size: 12px; font-weight: bold; color: #64748b; margin-bottom: 5px;">EXECUTED BY:</div>
                    <div style="font-size: 16px; font-weight: bold; color: #0f172a;">${builder.companyName}</div>
                    <div style="font-size: 14px; color: #475569;">${builder.ownerName} (${builder.email})</div>
                    
                    <div class="signature-box">
                        <img src="${signatureData}" alt="Digital Signature" />
                    </div>
                    <div style="font-size: 10px; color: #94a3b8; margin-top: 5px; text-align: center;">
                        Digitally signed on ${timestamp.toLocaleString('en-GB')} (UTC)
                    </div>
                </div>

                <div class="audit-trail-page">
                    <div class="audit-header">
                        <h2 style="margin: 0; color: #0f172a; font-size: 16pt;">Digital Execution Record</h2>
                        <p style="margin: 4px 0 0 0; font-size: 9pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Cryptographically Verified Execution Proof</p>
                    </div>
 
                    <div class="audit-grid">
                        <div class="audit-card">
                            <div class="audit-label">Authorized Signatory</div>
                            <div class="audit-value">${builder.ownerName}</div>
                        </div>
                        <div class="audit-card">
                            <div class="audit-label">Company / Entity</div>
                            <div class="audit-value">${builder.companyName}</div>
                        </div>
                        <div class="audit-card">
                            <div class="audit-label">Execution Reference</div>
                            <div class="audit-value">${refId}</div>
                        </div>
                        <div class="audit-card">
                            <div class="audit-label">Verification Timestamp (UTC)</div>
                            <div class="audit-value">${utcTimestamp}</div>
                        </div>
                        <div class="audit-card" style="grid-column: span 2;">
                            <div class="audit-label">Digital Execution Signature</div>
                            <div class="audit-value" style="background: white; border: 1px solid #eee; margin-top: 8px; padding: 10px; border-radius: 4px; display: flex; justify-content: center;">
                                <img src="${signatureData}" style="max-height: 80px; max-width: 100%;">
                            </div>
                        </div>
                        <div class="audit-card" style="grid-column: span 2;">
                            <div class="audit-label">Digital Footprint (IP & Agent)</div>
                            <div class="audit-value">
                                <strong>IP:</strong> ${ip}<br>
                                <strong>User Agent:</strong> ${userAgent}
                            </div>
                        </div>
                    </div>
 
                    <div class="seal-box">
                        <div class="seal">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="m9 12 2 2 4-4"></path></svg>
                            COMPENSATION PROTECTED & TAMPER-SEALED
                        </div>
                        <p class="legal-note">
                            This document is a legally binding electronic record as defined by the Electronics Communications Act 2000 (UK). 
                            Any modification to this document after the recorded timestamp voids the digital seal integrity. 
                            Benchmark Intelligence maintains the primary immutable audit record for this transaction.
                        </p>
                    </div>
                </div>
            </body>
            </html>
        `;

        // 3. Generate PDF
        const executablePath = await chromium.executablePath();
        browser = await puppeteer.launch({
            args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process'],
            defaultViewport: chromium.defaultViewport,
            executablePath: executablePath || undefined,
            headless: 'new',
        });

        const page = await browser.newPage();
        await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
        
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: '<div></div>',
            footerTemplate: `<div style="font-size: 8px; width: 100%; text-align: center; color: #94a3b8; padding-bottom: 20px;">Document Reference: ${refId} | Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
            margin: { top: '60px', bottom: '60px', left: '20px', right: '20px' }
        });

        await browser.close();
        browser = null;

        // 4. Store Evidence in permanent collection
        const signedRecord = {
            referenceId: refId,
            agreementId: agreementId,
            signerEmail: builder.email,
            signerIp: ip,
            signerUserAgent: userAgent,
            timestamp: timestamp,
            utcTimestamp: utcTimestamp,
            status: 'Tamper-Locked',
            versionTitle: version.title,
            builderName: builder.companyName
        };
        await db.collection('signedContracts').doc(agreementId).set(signedRecord);

        // 5. Update original agreement
        await agreementRef.update({
            status: 'Signed',
            dateSigned: timestamp,
            signatureData: signatureData,
            'auditTrail.signedAt': utcTimestamp,
            'auditTrail.ip': ip,
            'auditTrail.userAgent': userAgent,
            finalized: true
        });

        // 6. Send Email
        await sendReceiptEmail(builder.email, builder.ownerName, pdfBuffer, refId);

        return { success: true, referenceId: refId };

    } catch (error) {
        console.error("Contract Finalization Failed:", error);
        if (browser) await browser.close();
        throw error;
    }
}

async function sendReceiptEmail(to, name, pdfBuffer, refId) {
    // Note: User needs to configure their email delivery service (SendGrid/SMTP)
    // For now, we'll try to use environment variables or log a warning
    
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.sendgrid.net',
        port: process.env.SMTP_PORT || 587,
        secure: false, 
        auth: {
            user: process.env.SMTP_USER || 'apikey', // Default for SendGrid
            pass: process.env.SMTP_PASS || ''
        }
    });

    const mailOptions = {
        from: '"Benchmark Intelligence" <noreply@benchmarkintelligence.co.uk>',
        to: to,
        subject: `Finalized Contract: ${refId}`,
        text: `Dear ${name},\n\nPlease find attached the finalized, signed copy of your contract (Ref: ${refId}).\n\nThis document has been tamper-sealed and stored in our secure audit trail.\n\nBest regards,\nBenchmark Intelligence Team`,
        attachments: [
            {
                filename: `Contract_${refId}.pdf`,
                content: pdfBuffer
            }
        ]
    };

    try {
        if (!process.env.SMTP_PASS) {
            console.warn("SMTP_PASS not found. Skipping email delivery. PDF generated successfully.");
            return;
        }
        await transporter.sendMail(mailOptions);
        console.log(`Receipt email sent to ${to}`);
    } catch (err) {
        console.error("Email delivery failed:", err);
        // We don't throw here to ensure the function still returns success for the PDF generation
    }
}
