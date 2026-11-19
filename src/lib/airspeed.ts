/**
 * Indicated and true airspeed on a standard day.
 *
 * The planner holds true airspeed; a sight table is printed for the speed on
 * the pilot's gauge. These two turn one into the other at a height above sea
 * level. Indicated is taken as calibrated (no instrument error), with the
 * compressible pitot formula. No wind: true airspeed is what the planner
 * already flies.
 */

const A0_KT = 661.4786; // speed of sound at sea level, standard day
const T0_K = 288.15;
const P0_PA = 101325;
const LAPSE_K_PER_FT = 0.0019812;

function air(height_ft: number, isaDev_C: number): { t_K: number; p_Pa: number } {
  const tStd = T0_K - LAPSE_K_PER_FT * height_ft;
  // A warmer or colder day moves the temperature only; the pressure at a height stays the standard one.
  return { t_K: tStd + isaDev_C, p_Pa: P0_PA * Math.pow(tStd / T0_K, 5.255877) };
}

/** True airspeed to the speed on the gauge, at `height_ft` above sea level. */
export function tasToIas_kt(tas_kt: number, height_ft: number, isaDev_C = 0): number {
  const { t_K, p_Pa } = air(height_ft, isaDev_C);
  const mach = tas_kt / (A0_KT * Math.sqrt(t_K / T0_K));
  const qc = p_Pa * (Math.pow(1 + 0.2 * mach * mach, 3.5) - 1);
  return A0_KT * Math.sqrt(5 * (Math.pow(qc / P0_PA + 1, 2 / 7) - 1));
}

/** The speed on the gauge to true airspeed, at `height_ft` above sea level. */
export function iasToTas_kt(ias_kt: number, height_ft: number, isaDev_C = 0): number {
  const { t_K, p_Pa } = air(height_ft, isaDev_C);
  const r = ias_kt / A0_KT;
  const qc = P0_PA * (Math.pow(1 + 0.2 * r * r, 3.5) - 1);
  const mach = Math.sqrt(5 * (Math.pow(qc / p_Pa + 1, 2 / 7) - 1));
  return mach * A0_KT * Math.sqrt(t_K / T0_K);
}
