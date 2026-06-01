const SEASONAL_AGE_GROUP_START_MONTH = 8;
const SEASONAL_AGE_GROUP_TRANSITION_YEAR = 2026;

function normalizeBirthdate(birthdate: string | null | undefined) {
  if (!birthdate) return null;
  // Accept "YYYY-MM-DD" or ISO strings like "YYYY-MM-DDT00:00:00.000Z"
  const s = birthdate.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function getBirthYearFromBirthdate(
  birthdate: string | null | undefined
) {
  const norm = normalizeBirthdate(birthdate);
  if (!norm) return null;
  return Number(norm.slice(0, 4));
}

export function calculateAgeFromBirthdate(
  birthdate: string | null | undefined,
  now = new Date()
) {
  const norm = normalizeBirthdate(birthdate);
  if (!norm) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(norm);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return null;

  // Compare in local time; good enough for age.
  let age = now.getFullYear() - y;
  const hasHadBirthdayThisYear =
    now.getMonth() + 1 > mo ||
    (now.getMonth() + 1 === mo && now.getDate() >= d);
  if (!hasHadBirthdayThisYear) age -= 1;
  if (age < 0 || age > 120) return null;
  return age;
}

export function ageGroupFromAge(age: number | null) {
  if (age === null) return null;
  if (age < 3 || age > 40) return null;
  return `U${age}`;
}

function getSeasonalAgeGroupSeasonStartYear(now: Date) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  if (month >= SEASONAL_AGE_GROUP_START_MONTH) return year;

  // During the 2026 transition, show the incoming 2026-2027 seasonal groups
  // before August because registration and team planning are already moving.
  if (year === SEASONAL_AGE_GROUP_TRANSITION_YEAR) return year;

  return year - 1;
}

export function seasonalAgeGroupFromBirthdate(
  birthdate: string | null | undefined,
  now = new Date(),
) {
  const norm = normalizeBirthdate(birthdate);
  if (!norm) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(norm);
  if (!m) return null;

  const birthYear = Number(m[1]);
  const birthMonth = Number(m[2]);
  const birthDay = Number(m[3]);
  if (!birthYear || !birthMonth || !birthDay) return null;

  const seasonStartYear = getSeasonalAgeGroupSeasonStartYear(now);
  const cohortStartYear =
    birthMonth >= SEASONAL_AGE_GROUP_START_MONTH
      ? birthYear
      : birthYear - 1;
  const group = seasonStartYear - cohortStartYear;

  if (group < 3 || group > 40) return null;
  return `U${group}`;
}

export function calculatePlayerBirthMeta(
  birthdate: string | null | undefined,
  now = new Date(),
) {
  return {
    age: calculateAgeFromBirthdate(birthdate, now),
    birthYear: getBirthYearFromBirthdate(birthdate),
    ageGroup: seasonalAgeGroupFromBirthdate(birthdate, now),
  };
}
