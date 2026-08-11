"use client";

import { FormEvent, useEffect, useState } from "react";
import { KeyRound, MapPinned, ShieldCheck, UserRound } from "lucide-react";
import { apiFetch, clearToken, getToken, setToken } from "@/lib/api-client";

type Profile = { user: { id: string; email: string; displayName: string; trustedDevices: Array<{ _id: string; name: string; lastSeenAt: string }> }; contacts: Array<{ _id: string; name: string; phone: string; email: string; priority: number }>; trips: unknown[] };
type Registration = { displayName: string; email: string; password: string; contactName: string; contactPhone: string; contactEmail: string; locationMonitoring: boolean };

const emptyRegistration: Registration = { displayName: "", email: "", password: "", contactName: "", contactPhone: "", contactEmail: "", locationMonitoring: false };
const MAX_EMERGENCY_CONTACTS = 2;

export default function AccountPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [registrationStep, setRegistrationStep] = useState(1);
  const [registration, setRegistration] = useState<Registration>(emptyRegistration);

  async function loadProfile() {
    try {
      setProfile(await apiFetch<Profile>("/api/me"));
    } catch {
      clearToken();
      setProfile(null);
    } finally {
      setCheckingSession(false);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      const timer = window.setTimeout(() => setCheckingSession(false));
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => { void loadProfile(); });
    return () => window.clearTimeout(timer);
  }, []);

  function updateRegistration(update: Partial<Registration>) {
    setRegistration((current) => ({ ...current, ...update }));
  }

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const result = await apiFetch<{ token: string }>(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: registration.email,
          password: registration.password,
          displayName: registration.displayName,
          deviceName: navigator.userAgent.includes("Mobile") ? "Mobile browser" : "Desktop browser",
          locationMonitoringEnabled: registration.locationMonitoring,
        }),
      });
      setToken(result.token);
      if (mode === "register" && registration.contactName && registration.contactPhone && registration.contactEmail) {
        await apiFetch("/api/contacts", { method: "POST", body: JSON.stringify({ name: registration.contactName, phone: registration.contactPhone, email: registration.contactEmail, priority: 1 }) });
      }
      if (mode === "register" && registration.locationMonitoring && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(() => undefined, () => setNotice("Location permission was not granted. You can enable it later in your browser settings."));
      }
      await loadProfile();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to continue");
    }
  }

  async function addContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await apiFetch("/api/contacts", { method: "POST", body: JSON.stringify({ name: form.get("name"), phone: form.get("phone"), email: form.get("contactEmail"), priority: 1 }) });
      event.currentTarget.reset();
      setNotice("Emergency contact saved.");
      await loadProfile();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to save contact");
    }
  }

  function switchMode() {
    setMode((current) => current === "login" ? "register" : "login");
    setRegistrationStep(1);
    setRegistration(emptyRegistration);
    setError("");
    setNotice("");
  }

  if (checkingSession) return <main className="subpage"><p className="auth-loading">Checking your secure session...</p></main>;

  if (!profile) return <main className="subpage auth-page"><section className="auth-panel"><div className="auth-mark"><ShieldCheck size={24} /><span>Nirapod Jatra</span></div><p className="eyebrow">Secure account</p><h1>{mode === "login" ? "Welcome back" : "Create your safety profile"}</h1><p className="auth-intro">{mode === "login" ? "Sign in to manage journeys, trusted contacts, and trip monitoring." : "Set up the essentials before you begin your first monitored journey."}</p>{mode === "register" && <div className="registration-progress" aria-label={`Registration step ${registrationStep} of 3`}><span className={registrationStep >= 1 ? "active" : ""}>1 Account</span><span className={registrationStep >= 2 ? "active" : ""}>2 Contact</span><span className={registrationStep >= 3 ? "active" : ""}>3 Monitoring</span></div>}<form onSubmit={authenticate}>{mode === "login" && <><label>Email<input value={registration.email} onChange={(event) => updateRegistration({ email: event.target.value })} type="email" autoComplete="email" required /></label><label>Password<input value={registration.password} onChange={(event) => updateRegistration({ password: event.target.value })} type="password" autoComplete="current-password" required minLength={12} /></label><button className="auth-primary"><KeyRound size={16} /> Sign in</button></>}{mode === "register" && registrationStep === 1 && <><label>Full name<input value={registration.displayName} onChange={(event) => updateRegistration({ displayName: event.target.value })} autoComplete="name" required minLength={2} /></label><label>Email<input value={registration.email} onChange={(event) => updateRegistration({ email: event.target.value })} type="email" autoComplete="email" required /></label><label>Password<input value={registration.password} onChange={(event) => updateRegistration({ password: event.target.value })} type="password" autoComplete="new-password" required minLength={12} /></label><button type="button" className="auth-primary" onClick={(event) => { if (event.currentTarget.form?.reportValidity()) setRegistrationStep(2); }}>Continue</button></>}{mode === "register" && registrationStep === 2 && <><p className="form-hint">Add the person we should contact if you need help. You can add up to {MAX_EMERGENCY_CONTACTS} contacts; more can be added later from your account page.</p><label>Contact name<input value={registration.contactName} onChange={(event) => updateRegistration({ contactName: event.target.value })} required /></label><label>Phone number<input value={registration.contactPhone} onChange={(event) => updateRegistration({ contactPhone: event.target.value })} type="tel" required /></label><label>Contact email<input value={registration.contactEmail} onChange={(event) => updateRegistration({ contactEmail: event.target.value })} type="email" required /></label><p className="form-hint">We&apos;ll email this address if you ever send an SOS.</p><div className="form-actions"><button type="button" className="text-button" onClick={() => setRegistrationStep(1)}>Back</button><button type="button" className="auth-primary" onClick={(event) => { if (event.currentTarget.form?.reportValidity()) setRegistrationStep(3); }}>Continue</button></div></>}{mode === "register" && registrationStep === 3 && <><label className="check-label"><input checked={registration.locationMonitoring} onChange={(event) => updateRegistration({ locationMonitoring: event.target.checked })} type="checkbox" /> Share location while an active trip is open</label><p className="form-hint">This keeps your remaining route and nearby help details current during a trip.</p><div className="form-actions"><button type="button" className="text-button" onClick={() => setRegistrationStep(2)}>Back</button><button className="auth-primary"><UserRound size={16} /> Create account</button></div></>}</form>{error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-hint">{notice}</p>}<button className="auth-switch" onClick={switchMode}>{mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}</button></section><aside className="auth-aside"><MapPinned size={26} /><h2>Travel with a clearer picture</h2><p>Keep routes, conditions, emergency contacts, and trip updates in one protected place.</p></aside></main>;

  return <main className="subpage"><header className="subpage-header account-header"><div><p className="eyebrow">Account</p><h1>{profile.user.displayName}</h1><p>{profile.user.email}</p></div><button onClick={() => { clearToken(); setProfile(null); }}>Sign out</button></header><section className="account-grid"><article><h2>Trusted devices</h2><ul>{profile.user.trustedDevices.map((device) => <li key={device._id}><strong>{device.name}</strong><span>Last seen {new Date(device.lastSeenAt).toLocaleString()}</span></li>)}</ul></article><article><h2>Emergency contacts <span className="form-hint">({profile.contacts.length}/{MAX_EMERGENCY_CONTACTS})</span></h2><p className="form-hint">These are the people we email if you send an SOS.</p><ul>{profile.contacts.map((contact) => <li key={contact._id}><strong>{contact.name}</strong><span>{contact.phone}</span><span>{contact.email}</span></li>)}</ul>{profile.contacts.length < MAX_EMERGENCY_CONTACTS ? <form onSubmit={addContact} className="compact-form"><input name="name" placeholder="Contact name" required /><input name="phone" placeholder="Phone number" required /><input name="contactEmail" placeholder="Contact email" type="email" required /><button>Add contact</button></form> : <p className="form-hint">You&apos;ve reached the limit of {MAX_EMERGENCY_CONTACTS} emergency contacts.</p>}{notice && <p className="form-hint">{notice}</p>}</article></section></main>;
}
