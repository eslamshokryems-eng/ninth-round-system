"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  RACE_CATEGORIES,
  allowedPushupStyles,
  ageOnDate,
  checkEligibility,
  defaultPushupStyle,
  type PublicRaceEvent,
  type PushupStyle,
  type RaceCategoryCode,
  type RaceGender,
  type RegistrationConfirmation,
} from "@9thround/race";
import { getRaceModule } from "../../lib/composition-root";
import { RaceButton, RaceInput, RaceNotice, formatMoney } from "./race-ui";

type FieldName = "name" | "phone" | "email" | "dob" | "category" | "emergency" | "waiver";

const FIELD_FOR_CODE: Record<string, FieldName> = {
  RACE_INVALID_NAME: "name",
  RACE_INVALID_PHONE: "phone",
  RACE_ALREADY_REGISTERED: "phone",
  RACE_INVALID_EMAIL: "email",
  RACE_INVALID_DOB: "dob",
  RACE_DOB_REQUIRED: "dob",
  RACE_CATEGORY_GENDER: "category",
  RACE_CATEGORY_AGE: "category",
  RACE_INVALID_CATEGORY: "category",
  RACE_PUSHUP_STYLE_NOT_ALLOWED: "category",
  RACE_EMERGENCY_CONTACT_REQUIRED: "emergency",
  RACE_WAIVER_REQUIRED: "waiver",
};

// Placeholder wording — the organizers' legal team should replace this before the public launch.
const WAIVER_TEXT =
  "I confirm that I am medically fit to take part in a maximal-effort fitness race, that I take part at my own risk, and that I accept the event rules and the decisions of the officials.";

export interface RegistrationFormProps {
  event: PublicRaceEvent;
  /** "public": online registration. "staff": reception/manager registering on behalf of an athlete. */
  mode: "public" | "staff";
  onRegistered: (confirmation: RegistrationConfirmation) => void;
}

export function RegistrationForm({ event, mode, onRegistered }: RegistrationFormProps) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<RaceGender | "">("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [category, setCategory] = useState<RaceCategoryCode | "">("");
  const [pushupStyle, setPushupStyle] = useState<PushupStyle | null>(null);
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [waiver, setWaiver] = useState(false);
  const [error, setError] = useState<{ field: FieldName | null; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Which categories fit this athlete right now (same rules as the database, for instant feedback).
  const categoryState = useMemo(() => {
    const state = {} as Record<RaceCategoryCode, string | null>;
    for (const c of RACE_CATEGORIES) {
      if (gender === "" && dateOfBirth === "") {
        state[c.code] = null;
        continue;
      }
      const result = checkEligibility({
        category: c.code,
        gender: gender === "" ? null : gender,
        dateOfBirth: dateOfBirth === "" ? null : dateOfBirth,
        eventDate: event.eventDate,
        pushupStyle: null,
      });
      const blocking = result.isErr && ["RACE_CATEGORY_GENDER", "RACE_CATEGORY_AGE"].includes(result.error.code);
      // A category that only lacks a date of birth (Masters) stays selectable; the form asks for it.
      state[c.code] = blocking && result.isErr ? result.error.message : null;
    }
    return state;
  }, [gender, dateOfBirth, event.eventDate]);

  const styles = category === "" ? [] : allowedPushupStyles(category);
  const selectedStyle: PushupStyle | null = category === "" ? null : (pushupStyle ?? defaultPushupStyle(category));
  const age = dateOfBirth === "" ? null : ageOnDate(dateOfBirth, event.eventDate);

  async function handleSubmit(submitEvent: FormEvent) {
    submitEvent.preventDefault();
    if (isSubmitting) return;
    if (gender === "") return setError({ field: "category", message: "Select the athlete's gender." });
    if (category === "") return setError({ field: "category", message: "Choose a category." });
    setError(null);
    setIsSubmitting(true);

    const race = getRaceModule();
    const useCase = mode === "staff" ? race.staffRegisterAthlete : race.registerAthlete;
    const result = await useCase.execute({
      eventId: event.eventId,
      eventDate: event.eventDate,
      fullName,
      phone,
      email: email.trim() === "" ? null : email,
      gender,
      dateOfBirth: dateOfBirth === "" ? null : dateOfBirth,
      category,
      pushupStyle: selectedStyle,
      waiverAccepted: waiver,
      emergencyContact: { name: emergencyName, phone: emergencyPhone },
    });
    setIsSubmitting(false);

    if (result.isErr) {
      setError({ field: FIELD_FOR_CODE[result.error.code] ?? null, message: result.error.message });
      return;
    }
    onRegistered(result.value);
  }

  const fieldError = (field: FieldName) => (error?.field === field ? error.message : null);

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-5" noValidate>
      <RaceInput id="race-name" label="Full name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} error={fieldError("name")} required />
      <RaceInput
        id="race-phone"
        label="Phone (WhatsApp)"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="01X XXXX XXXX"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        error={fieldError("phone")}
        required
      />
      <RaceInput id="race-email" label="Email (optional)" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fieldError("email")} />

      <fieldset className="flex flex-col gap-2">
        <legend className="race-label mb-1">Gender</legend>
        <div className="grid grid-cols-2 gap-3">
          {(["male", "female"] as const).map((g) => (
            <label key={g} className="race-choice">
              <input type="radio" name="gender" value={g} checked={gender === g} onChange={() => setGender(g)} className="mr-2 accent-[#e10600]" />
              {g === "male" ? "Male" : "Female"}
            </label>
          ))}
        </div>
      </fieldset>

      <RaceInput
        id="race-dob"
        label="Date of birth"
        type="date"
        value={dateOfBirth}
        onChange={(e) => setDateOfBirth(e.target.value)}
        error={fieldError("dob")}
        hint={age !== null ? `Age on race day: ${age}` : "Required for Masters 40+"}
        max={event.eventDate}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="race-label mb-1">Category</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {RACE_CATEGORIES.map((c) => {
            const blockedReason = categoryState[c.code];
            return (
              <label key={c.code} className="race-choice" title={blockedReason ?? undefined}>
                <input
                  type="radio"
                  name="category"
                  value={c.code}
                  checked={category === c.code}
                  disabled={blockedReason !== null}
                  onChange={() => {
                    setCategory(c.code);
                    setPushupStyle(null);
                  }}
                  className="mr-2 accent-[#e10600]"
                />
                <span className="race-display text-xl">{c.name}</span>
              </label>
            );
          })}
        </div>
        {fieldError("category") ? (
          <p role="alert" className="text-sm" style={{ color: "var(--race-red-hot)" }}>
            {fieldError("category")}
          </p>
        ) : null}
      </fieldset>

      {category !== "" ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="race-label mb-1">Station 02 — push-ups</legend>
          {styles.length > 1 ? (
            <div className="grid grid-cols-2 gap-3">
              {styles.map((s) => (
                <label key={s} className="race-choice">
                  <input type="radio" name="pushup" value={s} checked={selectedStyle === s} onChange={() => setPushupStyle(s)} className="mr-2 accent-[#e10600]" />
                  {s === "STANDARD" ? "Standard (1 rep = 1 score)" : "Knee (3 reps = 1 score)"}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm" style={{ color: "var(--race-muted)" }}>
              Knee push-ups — every 3 complete reps count as 1 score.
            </p>
          )}
          <p className="text-xs" style={{ color: "var(--race-muted)" }}>
            You choose before the station starts. It cannot change during the station.
          </p>
        </fieldset>
      ) : null}

      <div className="race-card race-card--flat flex flex-col gap-4">
        <p className="race-label">Emergency contact</p>
        <RaceInput id="race-em-name" label="Contact name" value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} error={fieldError("emergency")} required />
        <RaceInput id="race-em-phone" label="Contact phone" type="tel" inputMode="tel" value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} required />
      </div>

      <label className="race-choice flex gap-3 text-sm">
        <input type="checkbox" checked={waiver} onChange={(e) => setWaiver(e.target.checked)} className="mt-1 h-5 w-5 accent-[#e10600]" />
        <span>{WAIVER_TEXT}</span>
      </label>
      {fieldError("waiver") ? (
        <p role="alert" className="text-sm" style={{ color: "var(--race-red-hot)" }}>
          {fieldError("waiver")}
        </p>
      ) : null}

      {error && error.field === null ? <RaceNotice>{error.message}</RaceNotice> : null}

      <RaceButton type="submit" isLoading={isSubmitting} className="w-full">
        {mode === "staff" ? "Register athlete" : event.registrationFee > 0 ? `Register — ${formatMoney(event.registrationFee, event.currency)}` : "Register"}
      </RaceButton>
      {event.registrationFee > 0 && mode === "public" ? (
        <p className="text-center text-xs" style={{ color: "var(--race-muted)" }}>
          Payment is confirmed manually by the organizers after you register.
        </p>
      ) : null}
    </form>
  );
}
