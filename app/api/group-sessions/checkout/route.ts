import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type Stripe from "stripe";

import { authOptions } from "@/lib/auth";
import { sql } from "@/db";
import {
  createPlayerSignup,
  getGroupSessionById,
  provisionParentAndPlayerForGroupSignup,
  updatePlayerSignupsCheckout,
} from "@/lib/groupSessions";
import { sendNewParentSignupEmail } from "@/lib/email";
import { getGroupSessionSignupPrice } from "@/lib/groupSessionPricing";
import { normalizePhoneForLookup, normalizePhoneForStorage } from "@/lib/phone";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";
const GROUP_TIME_ZONE = "America/Phoenix";

type GuestPlayerInput = {
  firstName?: string;
  lastName?: string;
  birthday?: string;
  preferredFoot?: string;
  team?: string;
  notes?: string;
};

type CheckoutBody = {
  groupSessionId?: number | string;
  playerIds?: string[];
  emergencyContact?: string;
  contactPhone?: string;
  contactEmail?: string;
  parentName?: string;
  parentPassword?: string;
  termsAccepted?: boolean;
  players?: GuestPlayerInput[];
};

type ParentRow = {
  email: string | null;
  phone: string | null;
  name: string | null;
};

type PlayerRow = {
  id: string;
  name: string;
  birthdate: string | null;
  age: number | null;
  dominant_foot: string | null;
  team_level: string | null;
  focus_areas: string | null;
  long_term_development_notes: string | null;
  in_privates: boolean;
};

type PaidSignupRow = {
  first_name: string | null;
  last_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  emergency_contact: string | null;
};

type CheckoutPlayer = {
  name: string;
  firstName: string;
  lastName: string;
  birthdate: string | null;
  age: number;
  dominantFoot: string | null;
  teamLevel: string | null;
  notes: string | null;
  inPrivates: boolean;
};

function cleanText(input: unknown) {
  return (input || "").toString().trim();
}

function cleanNullable(input: unknown) {
  const value = cleanText(input);
  return value || null;
}

function isValidEmail(input: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeDigits(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

function getSessionIdFromPath(pathname: string) {
  const match = pathname.match(/\/group-sessions\/(\d+)(?:\/)?$/);
  if (!match) return null;
  return Number(match[1]);
}

function parseGroupSessionInput(input: unknown) {
  const raw = cleanText(input);
  if (!raw) return null;

  const fromRaw = Number(raw);
  if (Number.isInteger(fromRaw) && fromRaw > 0) {
    return fromRaw;
  }

  try {
    const url = new URL(raw);
    return getSessionIdFromPath(url.pathname);
  } catch {
    return null;
  }
}

function splitPlayerName(name: string) {
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (!cleaned) return { firstName: "", lastName: "" };
  const [firstName, ...rest] = cleaned.split(" ");
  return { firstName, lastName: rest.join(" ") };
}

function calculateAgeFromBirthdate(birthdate: string | null) {
  if (!birthdate) return null;

  const parsed = new Date(`${birthdate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;

  const now = new Date();
  let age = now.getUTCFullYear() - parsed.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - parsed.getUTCMonth();
  if (
    monthDelta < 0 ||
    (monthDelta === 0 && now.getUTCDate() < parsed.getUTCDate())
  ) {
    age -= 1;
  }

  if (!Number.isInteger(age) || age < 1 || age > 99) return null;
  return age;
}

function addMinutes(input: string | Date, minutes: number) {
  return new Date(new Date(input).getTime() + minutes * 60_000);
}

function formatTimeRange(startInput: string, endInput: string | null) {
  const start = new Date(startInput);
  const end = endInput ? new Date(endInput) : addMinutes(start, 75);
  const format = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: GROUP_TIME_ZONE,
  });
  return `${format.format(start)} - ${format.format(end)}`;
}

export async function POST(request: NextRequest) {
  try {
    const authSession = await getServerSession(authOptions);
    const signedInParentId = authSession?.user?.id ?? null;

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Stripe is not configured" },
        { status: 500 }
      );
    }
    const stripe = getStripe();

    const body = (await request.json()) as CheckoutBody;
    if (body.termsAccepted !== true) {
      return NextResponse.json(
        { error: "You must agree to the Group Training Terms and Conditions." },
        { status: 400 }
      );
    }
    const groupSessionId = parseGroupSessionInput(body.groupSessionId);

    if (groupSessionId === null || !Number.isInteger(groupSessionId) || groupSessionId <= 0) {
      return NextResponse.json(
        { error: "Invalid group session id" },
        { status: 400 }
      );
    }

    const session = await getGroupSessionById(groupSessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (new Date(session.session_date).getTime() < Date.now()) {
      return NextResponse.json(
        { error: "Session has already passed" },
        { status: 400 }
      );
    }

    if (session.spots_left <= 0) {
      return NextResponse.json(
        { error: "This session is fully booked" },
        { status: 400 }
      );
    }

    let emergencyContact = "";
    let contactPhone = "";
    let contactEmail = "";
    let selectedPlayers: CheckoutPlayer[] = [];
    let parentPortalEmail = "";
    let parentPasswordForProvision: string | null = null;
    let existingParentIdForProvision = signedInParentId;
    let parentNameForMatching: string | null = null;

    if (signedInParentId) {
      const rawPlayerIds = Array.isArray(body.playerIds) ? body.playerIds : [];
      const playerIds = Array.from(
        new Set(rawPlayerIds.map((id) => cleanText(id)).filter(Boolean))
      );

      if (playerIds.length === 0) {
        return NextResponse.json(
          { error: "Select at least one player for signup" },
          { status: 400 }
        );
      }

      const parentRows = (await sql`
        SELECT email, phone, name
        FROM parents
        WHERE id = ${signedInParentId}
        LIMIT 1
      `) as unknown as ParentRow[];

      const parent = parentRows[0];
      if (!parent) {
        return NextResponse.json(
          { error: "Parent account not found" },
          { status: 404 }
        );
      }

      emergencyContact = cleanText(body.emergencyContact || parent.name || "Parent");
      contactPhone = cleanText(body.contactPhone || parent.phone || "");
      contactEmail = cleanText(body.contactEmail || parent.email || "").toLowerCase();
      const currentParentEmail = normalizeText(parent.email);
      const currentParentPhoneLookup = normalizePhoneForLookup(parent.phone);
      const contactPhoneLookup = normalizePhoneForLookup(contactPhone);

      if (!emergencyContact || !contactEmail) {
        return NextResponse.json(
          { error: "Emergency contact and contact email are required" },
          { status: 400 }
        );
      }
      if (!isValidEmail(contactEmail)) {
        return NextResponse.json(
          { error: "A valid contact email is required" },
          { status: 400 }
        );
      }

      if (contactPhone && contactPhoneLookup?.length !== 10) {
        return NextResponse.json(
          { error: "Please enter a 10-digit contact phone number." },
          { status: 400 }
        );
      }

      if (contactEmail !== currentParentEmail) {
        const emailConflict = (await sql`
          SELECT id
          FROM parents
          WHERE lower(email) = lower(${contactEmail})
            AND id <> ${signedInParentId}
          ORDER BY created_at ASC
          LIMIT 1
        `) as unknown as Array<{ id: string }>;

        if (emailConflict[0]) {
          return NextResponse.json(
            {
              error:
                "That email belongs to another parent account. Log in with that account to continue signup.",
            },
            { status: 409 }
          );
        }
      }

      if (contactPhoneLookup && contactPhoneLookup !== currentParentPhoneLookup) {
        const phoneConflict = (await sql`
          SELECT id
          FROM parents
          WHERE (
              regexp_replace(coalesce(phone, ''), '\\D', '', 'g') = ${contactPhoneLookup}
              OR right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = ${contactPhoneLookup}
            )
            AND id <> ${signedInParentId}
          ORDER BY created_at ASC
          LIMIT 1
        `) as unknown as Array<{ id: string }>;

        if (phoneConflict[0]) {
          return NextResponse.json(
            {
              error:
                "That phone number belongs to another parent account. Log in with that account to continue signup.",
            },
            { status: 409 }
          );
        }
      }

      contactPhone = normalizePhoneForStorage(contactPhone) || "";

      const allPlayers = (await sql`
        SELECT
          id,
          name,
          birthdate::text AS birthdate,
          age::int AS age,
          dominant_foot,
          team_level,
          focus_areas,
          long_term_development_notes,
          in_privates
        FROM players
        WHERE parent_id = ${signedInParentId}
        ORDER BY created_at ASC
      `) as unknown as PlayerRow[];

      const playerIdSet = new Set(playerIds);
      const selectedProfilePlayers = allPlayers.filter((player) =>
        playerIdSet.has(player.id)
      );

      if (selectedProfilePlayers.length !== playerIds.length) {
        return NextResponse.json(
          { error: "One or more selected players could not be found" },
          { status: 400 }
        );
      }

      const playersMissingAge = selectedProfilePlayers
        .filter((player) => {
          const ageFromBirthdate = calculateAgeFromBirthdate(player.birthdate);
          const ageFromField =
            Number.isInteger(player.age) && player.age !== null && player.age > 0
              ? player.age
              : null;
          return ageFromBirthdate === null && ageFromField === null;
        })
        .map((player) => player.name);

      if (playersMissingAge.length > 0) {
        return NextResponse.json(
          {
            error: `Missing birthday/age for: ${playersMissingAge.join(", ")}. Update player profile first.`,
          },
          { status: 400 }
        );
      }

      selectedPlayers = selectedProfilePlayers.map((player) => {
        const split = splitPlayerName(player.name);
        return {
          name: player.name,
          firstName: split.firstName,
          lastName: split.lastName,
          birthdate: player.birthdate,
          age: calculateAgeFromBirthdate(player.birthdate) ?? player.age ?? 0,
          dominantFoot: cleanNullable(player.dominant_foot),
          teamLevel: cleanNullable(player.team_level),
          notes: cleanNullable(
            player.focus_areas || player.long_term_development_notes || ""
          ),
          inPrivates: player.in_privates,
        };
      });

      parentPortalEmail = parent.email?.trim().toLowerCase() || contactEmail;
      parentNameForMatching = parent.name;
    } else {
      const parentName = cleanText(body.parentName || body.emergencyContact);
      const rawEmail = cleanText(body.contactEmail).toLowerCase();
      const rawPhone = cleanText(body.contactPhone);
      const parentPassword = cleanText(body.parentPassword);
      const guestPlayers = Array.isArray(body.players) ? body.players : [];

      if (!parentName || !rawEmail || !rawPhone || !parentPassword) {
        return NextResponse.json(
          {
            error:
              "Parent name, email, phone, and password are required to sign up.",
          },
          { status: 400 }
        );
      }

      if (!isValidEmail(rawEmail)) {
        return NextResponse.json(
          { error: "A valid parent email is required" },
          { status: 400 }
        );
      }

      if (parentPassword.length < 6) {
        return NextResponse.json(
          { error: "Password must be at least 6 characters" },
          { status: 400 }
        );
      }

      const normalizedPhone = normalizePhoneForStorage(rawPhone);
      const phoneLookup = normalizePhoneForLookup(rawPhone);
      if (!normalizedPhone || !phoneLookup) {
        return NextResponse.json(
          { error: "A valid parent phone is required" },
          { status: 400 }
        );
      }

      if (phoneLookup.length !== 10) {
        return NextResponse.json(
          { error: "Please enter a 10-digit parent phone number." },
          { status: 400 }
        );
      }

      const emailConflict = (await sql`
        SELECT id
        FROM parents
        WHERE lower(email) = lower(${rawEmail})
        LIMIT 1
      `) as unknown as Array<{ id: string }>;

      if (emailConflict[0]) {
        return NextResponse.json(
          {
            error:
              "An account with this email already exists. Log in to continue signup.",
          },
          { status: 409 }
        );
      }

      const phoneConflict = (await sql`
        SELECT id
        FROM parents
        WHERE regexp_replace(coalesce(phone, ''), '\\D', '', 'g') = ${phoneLookup}
           OR right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = ${phoneLookup}
        ORDER BY created_at ASC
        LIMIT 1
      `) as unknown as Array<{ id: string }>;

      if (phoneConflict[0]) {
        return NextResponse.json(
          {
            error:
              "An account with this phone already exists. Log in to continue signup.",
          },
          { status: 409 }
        );
      }

      if (guestPlayers.length === 0) {
        return NextResponse.json(
          { error: "Add at least one player for signup" },
          { status: 400 }
        );
      }

      selectedPlayers = guestPlayers.map((player, index) => {
        const firstName = cleanText(player.firstName);
        const lastName = cleanText(player.lastName);
        const birthday = cleanText(player.birthday);

        if (!firstName || !lastName) {
          throw new Error(`Player ${index + 1}: first and last name are required.`);
        }

        if (!birthday) {
          throw new Error(`Player ${index + 1}: birthday is required.`);
        }

        const age = calculateAgeFromBirthdate(birthday);
        if (age === null) {
          throw new Error(
            `Player ${index + 1}: please enter a valid birthday (age 1-99).`
          );
        }

        return {
          name: `${firstName} ${lastName}`.trim(),
          firstName,
          lastName,
          birthdate: birthday,
          age,
          dominantFoot: cleanNullable(player.preferredFoot),
          teamLevel: cleanNullable(player.team),
          notes: cleanNullable(player.notes),
          inPrivates: false,
        };
      });

      emergencyContact = parentName;
      contactEmail = rawEmail;
      contactPhone = normalizedPhone;
      parentPortalEmail = rawEmail;
      parentPasswordForProvision = parentPassword;
      parentNameForMatching = parentName;
    }

    if (selectedPlayers.length === 0) {
      return NextResponse.json(
        { error: "Select at least one player for signup" },
        { status: 400 }
      );
    }

    if (selectedPlayers.length > session.spots_left) {
      return NextResponse.json(
        {
          error: `Only ${session.spots_left} ${
            session.spots_left === 1 ? "spot is" : "spots are"
          } left for this session`,
        },
        { status: 400 }
      );
    }

    const existingPaidSignups = (await sql`
      SELECT
        first_name,
        last_name,
        contact_email,
        contact_phone,
        emergency_contact
      FROM player_signups
      WHERE group_session_id = ${groupSessionId}
        AND has_paid = true
    `) as unknown as PaidSignupRow[];

    const selectedNamePairs = new Set<string>();
    for (const player of selectedPlayers) {
      const first = normalizeText(player.firstName);
      const last = normalizeText(player.lastName);
      if (!first) continue;
      selectedNamePairs.add(`${first}|${last}`);
      if (!last) selectedNamePairs.add(`${first}|player`);
    }

    const parentEmail = normalizeText(contactEmail);
    const parentPhoneDigits = normalizeDigits(contactPhone);
    const parentName = normalizeText(emergencyContact || parentNameForMatching);

    const alreadyPaidPlayerNames = Array.from(
      new Set(
        existingPaidSignups
          .map((signup) => {
            const signupFirst = normalizeText(signup.first_name);
            const signupLast = normalizeText(signup.last_name);
            const signupPair = `${signupFirst}|${signupLast}`;
            if (!selectedNamePairs.has(signupPair)) return null;

            const signupEmail = normalizeText(signup.contact_email);
            const signupPhoneDigits = normalizeDigits(signup.contact_phone);
            const emergencyContactText = normalizeText(signup.emergency_contact);
            const emergencyContactDigits = normalizeDigits(signup.emergency_contact);

            const emailMatch = Boolean(parentEmail && signupEmail === parentEmail);
            const phoneMatch = Boolean(
              parentPhoneDigits &&
                (signupPhoneDigits === parentPhoneDigits ||
                  emergencyContactDigits.includes(parentPhoneDigits))
            );
            const parentNameMatch = Boolean(
              parentName && emergencyContactText.includes(parentName)
            );

            if (!emailMatch && !phoneMatch && !parentNameMatch) return null;
            return `${signup.first_name ?? ""} ${signup.last_name ?? ""}`.trim();
          })
          .filter((name): name is string => Boolean(name))
      )
    );

    if (alreadyPaidPlayerNames.length > 0) {
      return NextResponse.json(
        {
          error: `Already signed up: ${alreadyPaidPlayerNames.join(
            ", "
          )}. Email davidfalesct@gmail.com to cancel/reschedule.`,
        },
        { status: 409 }
      );
    }

    const crmContextNote = `Session booked via group checkout (${session.title} on ${new Date(
      session.session_date
    ).toLocaleString("en-US", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: GROUP_TIME_ZONE,
    })})`;

    const signupIds: number[] = [];
    const playerNames: string[] = [];
    let generatedPassword: string | null = null;
    let parentWasCreated = false;

    for (const player of selectedPlayers) {
      if (!player.firstName) {
        return NextResponse.json(
          { error: `Player name is required for ${player.name || "signup"}` },
          { status: 400 }
        );
      }
      if (!player.age || player.age < 1 || player.age > 99) {
        return NextResponse.json(
          { error: `A valid age is required for ${player.name}` },
          { status: 400 }
        );
      }

      const accountProvision = await provisionParentAndPlayerForGroupSignup({
        existingParentId: existingParentIdForProvision,
        portalPassword: parentPasswordForProvision,
        contactEmail,
        contactPhone: contactPhone || null,
        parentName: emergencyContact || null,
        firstName: player.firstName,
        lastName: player.lastName,
        playerAge: player.age,
        playerBirthdate: player.birthdate,
        foot: player.dominantFoot,
        team: player.teamLevel,
        notes: player.notes,
        crmContextNote,
      });

      existingParentIdForProvision = accountProvision.parentId;
      parentPasswordForProvision = null;

      if (!generatedPassword && accountProvision.generatedPassword) {
        generatedPassword = accountProvision.generatedPassword;
      }
      parentWasCreated = parentWasCreated || accountProvision.parentWasCreated;
      parentPortalEmail = accountProvision.parentEmail || parentPortalEmail;

      const signup = await createPlayerSignup({
        group_session_id: groupSessionId,
        first_name: player.firstName,
        last_name: player.lastName,
        emergency_contact: emergencyContact,
        contact_phone: contactPhone || null,
        contact_email: contactEmail,
        birthday: player.birthdate,
        foot: player.dominantFoot,
        team: player.teamLevel,
        notes: player.notes,
        signup_price: getGroupSessionSignupPrice(player.inPrivates, session.price),
      });

      signupIds.push(signup.id);
      playerNames.push(player.name);
    }

    if (parentWasCreated) {
      const createdAtLabel = new Date().toLocaleString("en-US", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: GROUP_TIME_ZONE,
      });
      void sendNewParentSignupEmail({
        email: contactEmail,
        phone: contactPhone || "N/A",
        createdAt: createdAtLabel,
      });
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      request.headers.get("origin") ||
      "http://localhost:3000";
    const standardSignupPrice = getGroupSessionSignupPrice(false, session.price);
    const privateSignupPrice = getGroupSessionSignupPrice(true, session.price);
    const standardPlayerCount = selectedPlayers.filter(
      (player) => !player.inPrivates
    ).length;
    const privatePlayerCount = selectedPlayers.length - standardPlayerCount;
    const sessionDescription = `${new Date(session.session_date).toLocaleString("en-US", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: GROUP_TIME_ZONE,
    })} (${formatTimeRange(session.session_date, session.session_date_end)})${
      session.location ? ` • ${session.location}` : ""
    }`;
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    if (standardPlayerCount > 0) {
      lineItems.push({
        quantity: standardPlayerCount,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(standardSignupPrice * 100),
          product_data: {
            name: `${session.title} (Standard Signup)`,
            description: sessionDescription,
          },
        },
      });
    }

    if (privatePlayerCount > 0) {
      lineItems.push({
        quantity: privatePlayerCount,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(privateSignupPrice * 100),
          product_data: {
            name: `${session.title} (Private Package Discount)`,
            description: sessionDescription,
          },
        },
      });
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${siteUrl}/group-sessions/${session.id}?checkout=success`,
      cancel_url: `${siteUrl}/group-sessions/${session.id}?checkout=cancelled`,
      customer_email: contactEmail,
      line_items: lineItems,
      metadata: {
        group_session_id: String(session.id),
        player_signup_ids: signupIds.join(","),
        player_count: String(selectedPlayers.length),
        standard_player_count: String(standardPlayerCount),
        private_player_count: String(privatePlayerCount),
        parent_portal_email: parentPortalEmail,
        parent_portal_password: generatedPassword || "",
        parent_portal_is_new: parentWasCreated ? "true" : "false",
        terms_accepted: "true",
      },
    });

    await updatePlayerSignupsCheckout(
      signupIds,
      checkoutSession.id,
      typeof checkoutSession.payment_intent === "string"
        ? checkoutSession.payment_intent
        : null
    );

    if (!checkoutSession.url) {
      return NextResponse.json(
        { error: "Failed to create checkout URL" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        checkoutUrl: checkoutSession.url,
        signupCount: selectedPlayers.length,
        playerNames,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start checkout";
    console.error("Failed to create checkout session", error);

    if (message.startsWith("Player ")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (message.includes("already exists")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    return NextResponse.json({ error: "Failed to start checkout" }, { status: 500 });
  }
}
