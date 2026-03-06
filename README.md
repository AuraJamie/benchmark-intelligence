# Benchmark Intelligence

Benchmark Intelligence is a modern platform to identify, capture, and distribute construction leads sourced automatically from the City of York Planning Portal.

This repository contains:
1. The **React/Vite Frontend** (Internal Dashboard & Lead Capture form) located in `/src`.
2. The **Node.js Scraper** (Puppeteer automation) located in `/functions`.

## Running the Scraper via GitHub Actions (100% Free)

Because we use Puppeteer to subvert the council's Web Application Firewall (WAF), deploying the scraper to Google Cloud Functions requires a paid "Blaze" plan with a credit card to afford the memory requirement.

Instead, we have pivoted to using **GitHub Actions**, which provides generous free-tier servers that can execute this task on a schedule for $0/month.

### Setup Instructions

To authorize GitHub to write the scraped data into your Firebase database, you need to create a Service Account key and add it to GitHub Secrets.

1. Go to your [Firebase Console](https://console.firebase.google.com/).
2. Select your project.
3. Click the **Gear Icon** (Project settings) in the top left, and select **Project settings**.
4. Go to the **Service accounts** tab.
5. Click the **Generate new private key** button. This will download a `.json` file to your computer.
6. Open that `.json` file in a text editor (like Notepad) and **copy all of the text**.
7. Go to this repository on GitHub.
8. Go to **Settings** > **Secrets and variables** > **Actions**.
9. Click **New repository secret**.
10. Set the Name to exactly: `FIREBASE_SERVICE_ACCOUNT`
11. Paste the entire JSON you copied into the Secret field, and click Add secret.

### Triggering the Scraper
Once the secret is added:
- The scraper runs **automatically every Friday at 5:00 PM UK Time**.
- You can run it manually at any time by going to the **Actions** tab on GitHub, selecting **Weekly Benchmark Scraper**, and clicking **Run workflow**.
