'use client';
import { useEffect } from 'react';

/**
 * Gmail OAuth callback page.
 * This page is opened in a popup. When Google redirects here with a code,
 * we post the code back to the opener window and close the popup.
 */
export default function GmailCallbackPage() {
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const error = params.get('error');

        if (window.opener) {
            window.opener.postMessage(
                { type: 'gmail-oauth-callback', code, error },
                window.location.origin
            );
            window.close();
        }
    }, []);

    return (
        <div
            style={{
                minHeight: '100vh',
                background: '#FAFAF8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 12,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: '#444',
            }}
        >
            <link
                href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&display=swap"
                rel="stylesheet"
            />
            Processing Gmail authorization…
        </div>
    );
}
