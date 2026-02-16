import type { KneeboardCard, KneeboardDiagramData, KneeboardStep } from '../types/kneeboard.types';

export const KNEEBOARD_WIDTH = 768;
export const KNEEBOARD_HEIGHT = 1024;

// ─── Colour palette ───────────────────────────────────────────────────────────
const C = {
  bg: '#FFFDF5',
  headerBg: '#1C2B3A',
  headerText: '#FFFFFF',
  sectionBg: '#E8E8E0',
  sectionLabel: '#1C2B3A',
  textPrimary: '#0F0F0F',
  textGray: '#505050',
  divider: '#999999',
  accent: '#CC2200',
  accentBg: '#FFF0EE',
  accentLight: '#FFE0DC',
  stepTitleBg: '#2C3E50',
  stepTitleText: '#FFFFFF',
  stepBg: '#FAFAF4',
  threatClose: '#8B0000',
  diagramBg: '#F0F0E8',
  runIn: '#3366CC',
  popClimb: '#CC8800',
  attackDive: '#CC2200',
  egress: '#228833',
};

const MONO = "'Courier New', Courier, monospace";
const SANS = "'Arial Narrow', Arial, sans-serif";

// ─── Drawing primitives ───────────────────────────────────────────────────────

function fillRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function hLine(ctx: CanvasRenderingContext2D, y: number, color = C.divider, thickness = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(0, y, KNEEBOARD_WIDTH, thickness);
}

function txt(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  opts: { color?: string; size?: number; bold?: boolean; family?: string; align?: CanvasTextAlign; maxW?: number } = {},
) {
  const { color = C.textPrimary, size = 13, bold = false, family = MONO, align = 'left', maxW } = opts;
  ctx.fillStyle = color;
  ctx.font = `${bold ? 'bold ' : ''}${size}px ${family}`;
  ctx.textAlign = align;
  if (maxW !== undefined) {
    ctx.fillText(str, x, y, maxW);
  } else {
    ctx.fillText(str, x, y);
  }
}

function sectionStrip(ctx: CanvasRenderingContext2D, label: string, y: number, rightText?: string): number {
  fillRect(ctx, 0, y, KNEEBOARD_WIDTH, 20, C.sectionBg);
  txt(ctx, label, 8, y + 14, { bold: true, size: 11, family: SANS, color: C.sectionLabel });
  if (rightText) txt(ctx, rightText, KNEEBOARD_WIDTH - 8, y + 14, { size: 10, family: SANS, color: C.textGray, align: 'right' });
  return y + 20;
}

// ─── Header (64px) ────────────────────────────────────────────────────────────

function drawHeader(ctx: CanvasRenderingContext2D, card: KneeboardCard): number {
  fillRect(ctx, 0, 0, KNEEBOARD_WIDTH, 58, C.headerBg);

  // Callsign (left)
  txt(ctx, card.header.callsign, 10, 30, { color: C.headerText, size: 22, bold: true, family: SANS });

  // Target name (right)
  txt(ctx, card.header.targetName, KNEEBOARD_WIDTH - 10, 30, {
    color: C.headerText, size: 18, bold: true, family: SANS, align: 'right', maxW: 340,
  });

  // Profile type (left-bottom) + date (right-bottom)
  txt(ctx, card.attackSection.profileType, 10, 50, { color: '#88AACC', size: 12, bold: true, family: MONO });
  txt(ctx, card.header.missionDate, KNEEBOARD_WIDTH - 10, 50, { color: '#667788', size: 11, family: MONO, align: 'right' });

  hLine(ctx, 58, '#334455', 2);
  return 60;
}

// ─── Target section (compact, ~80px) ─────────────────────────────────────────

function drawTargetSection(ctx: CanvasRenderingContext2D, card: KneeboardCard, y: number): number {
  y = sectionStrip(ctx, 'TARGET', y);

  txt(ctx, card.targetSection.name, 10, y + 18, { size: 16, bold: true, family: SANS, color: C.textPrimary });
  y += 22;
  txt(ctx, card.targetSection.coordinates, 10, y + 15, { size: 13, family: MONO, color: C.textPrimary });
  y += 18;
  txt(ctx, `Elev: ${card.targetSection.elevation_ft.toLocaleString()}ft MSL`, 10, y + 14, { size: 12, family: MONO, color: C.textGray });
  y += 16;

  hLine(ctx, y, C.divider);
  return y + 1;
}

// ─── Weapon section (compact, ~48px) ─────────────────────────────────────────

function drawWeaponSection(ctx: CanvasRenderingContext2D, card: KneeboardCard, y: number): number {
  y = sectionStrip(ctx, 'WEAPON', y);

  const w = card.weaponSection;
  // Main weapon line
  const mainLine = `${w.quantity}× ${w.weaponName}   ${w.releaseMode}   ${w.fuze}`;
  txt(ctx, mainLine, 10, y + 17, { size: 13, bold: true, family: MONO, color: C.textPrimary, maxW: KNEEBOARD_WIDTH - 20 });
  y += 20;

  // Min safe alt (red, on separate line if present)
  if (w.minSafeAlt_ft != null) {
    fillRect(ctx, 0, y, KNEEBOARD_WIDTH, 20, C.accentLight);
    txt(ctx, `⚠ MIN SAFE ALT: ${w.minSafeAlt_ft.toLocaleString()}ft AGL`, 10, y + 14, {
      size: 12, bold: true, family: SANS, color: C.accent,
    });
    y += 20;
  }

  hLine(ctx, y, C.divider);
  return y + 1;
}

// ─── Threats section (compact rows) ──────────────────────────────────────────

function drawThreatsSection(ctx: CanvasRenderingContext2D, card: KneeboardCard, y: number): number {
  const threats = card.threatSection.threats.slice(0, 5);
  y = sectionStrip(ctx, 'THREATS IN AREA', y, 'BRG / DIST / MAX RNG');

  if (threats.length === 0) {
    txt(ctx, 'No threats within 60nm', 10, y + 14, { size: 12, family: MONO, color: C.textGray });
    y += 18;
  } else {
    for (const threat of threats) {
      const isInRange = threat.distance_nm <= threat.maxRange_nm;
      const rowColor = isInRange ? C.accentBg : C.bg;
      fillRect(ctx, 0, y, KNEEBOARD_WIDTH, 19, rowColor);

      txt(ctx, threat.name, 8, y + 13, {
        size: 12, bold: isInRange, family: MONO,
        color: isInRange ? C.threatClose : C.textPrimary, maxW: 340,
      });
      const brgStr = `${String(threat.bearing_deg).padStart(3, '0')}°`;
      const distStr = `${threat.distance_nm.toFixed(1)}nm`;
      const rngStr = `max ${threat.maxRange_nm.toFixed(0)}nm`;
      txt(ctx, brgStr, 430, y + 13, { size: 12, bold: true, family: MONO, color: isInRange ? C.accent : C.textPrimary, align: 'right' });
      txt(ctx, distStr, 550, y + 13, { size: 12, family: MONO, color: isInRange ? C.accent : C.textPrimary, align: 'right' });
      txt(ctx, rngStr, 720, y + 13, { size: 11, family: MONO, color: C.textGray, align: 'right' });
      y += 19;
    }
  }

  hLine(ctx, y, C.divider);
  return y + 1;
}

// ─── Attack diagram ───────────────────────────────────────────────────────────

function drawAttackDiagram(ctx: CanvasRenderingContext2D, diagram: KneeboardDiagramData, y: number): number {
  const H = 230;
  fillRect(ctx, 0, y, KNEEBOARD_WIDTH, H, C.diagramBg);

  if (diagram.type === 'popup_ccip' && diagram.popupCCIP) {
    drawPopupCCIPDiagram(ctx, diagram, y, H);
  } else if (diagram.type === 'dive_ccip' && diagram.diveCCIP) {
    drawDiveCCIPDiagram(ctx, diagram, y, H);
  } else if (diagram.type === 'level_ccrp' && diagram.levelCCRP) {
    drawLevelCCRPDiagram(ctx, diagram, y, H);
  } else {
    txt(ctx, `[${diagram.type.toUpperCase()} DIAGRAM]`, KNEEBOARD_WIDTH / 2, y + H / 2, {
      size: 14, family: SANS, color: C.textGray, align: 'center',
    });
  }

  hLine(ctx, y + H, C.divider);
  return y + H + 1;
}

/** Side-profile altitude diagram for popup CCIP */
function drawPopupCCIPDiagram(
  ctx: CanvasRenderingContext2D,
  diagram: KneeboardDiagramData,
  boxY: number,
  boxH: number,
) {
  const pd = diagram.popupCCIP!;
  const padX = 30, padTop = 22, padBottom = 38;
  const drawW = KNEEBOARD_WIDTH - padX * 2;
  const drawH = boxH - padTop - padBottom;

  // Altitude and distance scales
  const maxAlt = pd.apexAltitude_ft * 1.25;
  const pxPerFt = drawH / maxAlt;

  // Total schematic distance: IP(3nm before POP) → POP → TGT → egress(2nm)
  const ipExtraNm = 3.5;
  const egressNm = 2;
  const totalNm = pd.popDistance_nm + ipExtraNm + egressNm;
  const pxPerNm = drawW / totalNm;

  const groundY = boxY + padTop + drawH;

  // X positions (origin = TGT)
  const tgtX = padX + (pd.popDistance_nm + ipExtraNm) * pxPerNm;
  const popX = tgtX - pd.popDistance_nm * pxPerNm;
  const ipX = popX - ipExtraNm * pxPerNm;
  const egressX = tgtX + egressNm * pxPerNm;

  // ATK point (roll-in): calculate distance from TGT via dive geometry
  const diveRad = pd.diveAngle_deg * Math.PI / 180;
  const atkDistNm = Math.min((pd.rollInAltitude_ft / Math.tan(diveRad)) / 6076, pd.popDistance_nm * 0.8);
  const atkX = tgtX - atkDistNm * pxPerNm;
  const atkY = groundY - pd.rollInAltitude_ft * pxPerFt;

  // Y positions (altitude)
  const ipY = groundY - pd.runInAltitude_ft * pxPerFt;
  const popY = ipY;
  const apexY = groundY - pd.apexAltitude_ft * pxPerFt;
  const apexX = popX + (atkX - popX) * 0.45; // apex slightly before ATK
  const relY = groundY - pd.releaseAltitude_ft * pxPerFt;
  const deckY = groundY - pd.minAltitude_ft * pxPerFt;
  const tgtY = groundY;
  const egressEndY = groundY - 55;

  // ── Altitude reference lines ────────────────────────────────────────────
  // Hard deck (red dashed)
  ctx.save();
  ctx.strokeStyle = C.accent;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(padX, deckY); ctx.lineTo(tgtX + 20, deckY); ctx.stroke();
  ctx.restore();

  // Release altitude marker (light red dashed, between ATK and TGT)
  ctx.save();
  ctx.strokeStyle = '#EE6644';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 2]);
  ctx.beginPath(); ctx.moveTo(atkX, relY); ctx.lineTo(tgtX + 2, relY); ctx.stroke();
  ctx.restore();

  // ── Ground line + hatching ──────────────────────────────────────────────
  ctx.save();
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(padX, groundY);
  ctx.lineTo(tgtX + 4, groundY);
  ctx.stroke();
  // hatching
  ctx.strokeStyle = '#AAA';
  ctx.lineWidth = 0.8;
  for (let x = padX + 6; x < tgtX + 5; x += 14) {
    ctx.beginPath(); ctx.moveTo(x, groundY); ctx.lineTo(x - 9, groundY + 11); ctx.stroke();
  }
  ctx.restore();

  // ── Flight path lines ───────────────────────────────────────────────────
  ctx.save();
  ctx.lineWidth = 2.5;

  // Run-in: IP → POP (dashed blue, low level)
  ctx.strokeStyle = C.runIn;
  ctx.setLineDash([10, 6]);
  ctx.beginPath(); ctx.moveTo(ipX, ipY); ctx.lineTo(popX, popY); ctx.stroke();

  // Pop/climb: POP → apex → ATK (solid orange, bezier)
  ctx.strokeStyle = C.popClimb;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(popX, popY);
  ctx.bezierCurveTo(
    popX + (atkX - popX) * 0.2, popY,
    apexX - 20, apexY,
    atkX, atkY,
  );
  ctx.stroke();

  // Attack dive: ATK → TGT (solid red)
  ctx.strokeStyle = C.attackDive;
  ctx.beginPath(); ctx.moveTo(atkX, atkY); ctx.lineTo(tgtX, tgtY); ctx.stroke();

  // Egress arrow (dashed green)
  ctx.strokeStyle = C.egress;
  ctx.setLineDash([7, 5]);
  ctx.lineWidth = 2;
  const dir = diagram.egressDirection?.toLowerCase();
  const egressEndYFinal = dir === 'right' ? egressEndY : egressEndY + 30;
  ctx.beginPath(); ctx.moveTo(tgtX, tgtY); ctx.lineTo(egressX, egressEndYFinal); ctx.stroke();
  ctx.setLineDash([]);

  // Arrowhead
  const ang = Math.atan2(egressEndYFinal - tgtY, egressX - tgtX);
  ctx.fillStyle = C.egress;
  ctx.beginPath();
  ctx.moveTo(egressX, egressEndYFinal);
  ctx.lineTo(egressX - 12 * Math.cos(ang - 0.45), egressEndYFinal - 12 * Math.sin(ang - 0.45));
  ctx.lineTo(egressX - 12 * Math.cos(ang + 0.45), egressEndYFinal - 12 * Math.sin(ang + 0.45));
  ctx.closePath(); ctx.fill();
  ctx.restore();

  // ── Point markers ───────────────────────────────────────────────────────
  const dotLabel = (x: number, cy: number, label: string, fill: string, r = 15, textColor = '#FFF') => {
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.arc(x, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = textColor;
    ctx.font = `bold 10px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, cy);
    ctx.textBaseline = 'alphabetic';
  };
  const note = (x: number, ny: number, str: string, color: string, align: CanvasTextAlign = 'center') => {
    ctx.fillStyle = color;
    ctx.font = `10px ${MONO}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, x, ny);
  };

  dotLabel(ipX, ipY, 'IP', '#4466AA');
  note(ipX, ipY + 22, `${pd.runInAltitude_ft}'AGL`, C.runIn);
  note(ipX, ipY + 33, `${pd.runInSpeed_ktas}kts`, C.runIn);

  dotLabel(popX, popY, 'POP', '#CC8800');
  note(popX, popY + 22, `${pd.popDistance_nm}nm out`, C.popClimb);

  // Apex star
  ctx.fillStyle = C.popClimb;
  ctx.font = `bold 18px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', apexX, apexY);
  ctx.textBaseline = 'alphabetic';
  note(apexX + 30, apexY - 3, `${pd.apexAltitude_ft.toLocaleString()}'`, C.popClimb, 'left');

  dotLabel(atkX, atkY, 'ATK', '#CC5500');
  note(atkX, atkY - 20, `${pd.rollInAltitude_ft.toLocaleString()}'AGL`, C.attackDive);
  note(atkX, atkY - 9, `${pd.diveAngle_deg}° dive`, C.attackDive);

  dotLabel(tgtX, tgtY, 'TGT', C.accent, 16);

  // Release alt label
  ctx.fillStyle = '#EE4422';
  ctx.font = `9px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`REL: ${pd.releaseAltitude_ft.toLocaleString()}'`, atkX + 5, relY - 2);
  ctx.textBaseline = 'alphabetic';

  // Hard deck label
  ctx.fillStyle = C.accent;
  ctx.font = `9px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.fillText(`HARD DECK: ${pd.minAltitude_ft.toLocaleString()}'AGL`, padX + 2, deckY - 3);

  // Title strip
  ctx.fillStyle = C.sectionLabel;
  ctx.font = `bold 11px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(
    `ATTACK HDG: ${pd.runInHeading_deg}°  ←  EGRESS ${diagram.egressDirection?.toUpperCase()} ${diagram.egressHeading_deg}°  →`,
    KNEEBOARD_WIDTH / 2, boxY + 3,
  );
  ctx.textBaseline = 'alphabetic';
}

/** Simplified side-profile for dive CCIP */
function drawDiveCCIPDiagram(
  ctx: CanvasRenderingContext2D,
  diagram: KneeboardDiagramData,
  boxY: number,
  boxH: number,
) {
  const pd = diagram.diveCCIP!;
  const padX = 30, padTop = 22, padBottom = 30;
  const drawW = KNEEBOARD_WIDTH - padX * 2;
  const drawH = boxH - padTop - padBottom;

  const maxAlt = pd.rollInAltitude_ft * 1.3;
  const pxPerFt = drawH / maxAlt;
  const groundY = boxY + padTop + drawH;

  const egressNm = 2;
  const totalNm = 6 + egressNm;
  const pxPerNm = drawW / totalNm;
  const tgtX = padX + 5 * pxPerNm;

  const diveRad = pd.diveAngle_deg * Math.PI / 180;
  const rollDistNm = Math.min((pd.rollInAltitude_ft / Math.tan(diveRad)) / 6076, 4);
  const rollX = tgtX - rollDistNm * pxPerNm;
  const rollY = groundY - pd.rollInAltitude_ft * pxPerFt;
  const relY = groundY - pd.releaseAltitude_ft * pxPerFt;
  const egressX = tgtX + egressNm * pxPerNm;
  const egressEndY = groundY - 50;

  // Ground
  ctx.save();
  ctx.strokeStyle = '#888'; ctx.lineWidth = 1.5; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(padX, groundY); ctx.lineTo(tgtX + 4, groundY); ctx.stroke();
  ctx.strokeStyle = '#AAA'; ctx.lineWidth = 0.8;
  for (let x = padX + 6; x < tgtX + 5; x += 14) {
    ctx.beginPath(); ctx.moveTo(x, groundY); ctx.lineTo(x - 9, groundY + 11); ctx.stroke();
  }
  ctx.restore();

  // Ingress line (flat, dashed blue)
  ctx.save();
  ctx.strokeStyle = C.runIn; ctx.lineWidth = 2.5; ctx.setLineDash([10, 6]);
  ctx.beginPath(); ctx.moveTo(padX, rollY); ctx.lineTo(rollX, rollY); ctx.stroke();

  // Dive (red)
  ctx.strokeStyle = C.attackDive; ctx.setLineDash([]); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(rollX, rollY); ctx.lineTo(tgtX, groundY); ctx.stroke();

  // Release marker
  ctx.strokeStyle = '#EE6644'; ctx.lineWidth = 1; ctx.setLineDash([3, 2]);
  ctx.beginPath(); ctx.moveTo(rollX, relY); ctx.lineTo(tgtX + 2, relY); ctx.stroke();

  // Egress
  ctx.strokeStyle = C.egress; ctx.lineWidth = 2; ctx.setLineDash([7, 5]);
  ctx.beginPath(); ctx.moveTo(tgtX, groundY); ctx.lineTo(egressX, egressEndY); ctx.stroke();
  ctx.setLineDash([]); ctx.restore();

  // Labels
  const dotLabel = (x: number, cy: number, label: string, fill: string, r = 15) => {
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.arc(x, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFF'; ctx.font = `bold 10px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x, cy); ctx.textBaseline = 'alphabetic';
  };

  dotLabel(rollX, rollY, 'ROLL\nIN', '#4466AA');
  ctx.fillStyle = C.runIn; ctx.font = `10px ${MONO}`; ctx.textAlign = 'center';
  ctx.fillText(`${pd.rollInAltitude_ft.toLocaleString()}'AGL`, rollX, rollY - 20);
  ctx.fillText(`${pd.diveAngle_deg}° dive`, rollX, rollY - 9);
  dotLabel(tgtX, groundY, 'TGT', C.accent, 16);

  ctx.fillStyle = '#EE4422'; ctx.font = `9px ${MONO}`; ctx.textAlign = 'left';
  ctx.fillText(`REL: ${pd.releaseAltitude_ft.toLocaleString()}'AGL`, rollX + 5, relY - 3);

  ctx.fillStyle = C.sectionLabel; ctx.font = `bold 11px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(`INGRESS HDG: ${pd.ingressHeading_deg}°  →  EGRESS ${diagram.egressDirection?.toUpperCase()}`, KNEEBOARD_WIDTH / 2, boxY + 4);
  ctx.textBaseline = 'alphabetic';
}

/** Top-down schematic for level CCRP */
function drawLevelCCRPDiagram(
  ctx: CanvasRenderingContext2D,
  diagram: KneeboardDiagramData,
  boxY: number,
  boxH: number,
) {
  const pd = diagram.levelCCRP!;
  const cx = KNEEBOARD_WIDTH / 2;
  const cy = boxY + boxH / 2;

  // Simple top-down: arrow → TGT → egress arrow
  ctx.save();
  ctx.strokeStyle = C.runIn; ctx.lineWidth = 3; ctx.setLineDash([12, 8]);
  ctx.beginPath(); ctx.moveTo(cx - 260, cy); ctx.lineTo(cx - 40, cy); ctx.stroke();
  ctx.strokeStyle = C.attackDive; ctx.setLineDash([]); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - 40, cy); ctx.lineTo(cx, cy); ctx.stroke();
  ctx.strokeStyle = C.egress; ctx.setLineDash([8, 5]);
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 220, cy); ctx.stroke();
  ctx.restore();

  // TGT dot
  ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(cx, cy, 18, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FFF'; ctx.font = `bold 11px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('TGT', cx, cy); ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = C.sectionLabel; ctx.font = `bold 11px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(`INGRESS ${pd.ingressHeading_deg}°  →  AUTO-RELEASE  →  EGRESS ${pd.egressHeading_deg}°`, cx, boxY + 8);
  ctx.textBaseline = 'alphabetic';
}

// ─── Step-by-step procedure ───────────────────────────────────────────────────

function drawSteps(ctx: CanvasRenderingContext2D, steps: KneeboardStep[], y: number): number {
  y = sectionStrip(ctx, 'STEP-BY-STEP PROCEDURE', y, 'Follow in order');
  y += 4;

  for (const step of steps) {
    // Title bar
    const titleBg = step.isWarning ? '#7A1500' : C.stepTitleBg;
    fillRect(ctx, 6, y, KNEEBOARD_WIDTH - 12, 22, titleBg);
    txt(ctx, step.title, 14, y + 15, { color: C.stepTitleText, size: 12, bold: true, family: SANS });
    y += 22;

    // Content lines
    const contentBg = step.isWarning ? '#FFF5F3' : C.stepBg;
    const lineH = 19;
    fillRect(ctx, 6, y, KNEEBOARD_WIDTH - 12, step.lines.length * lineH + 6, contentBg);
    y += 4;
    for (const line of step.lines) {
      const isWarningLine = line.startsWith('⚠');
      txt(ctx, `  ${line}`, 14, y + 13, {
        size: 12,
        family: MONO,
        color: isWarningLine ? C.accent : C.textPrimary,
        bold: isWarningLine,
        maxW: KNEEBOARD_WIDTH - 30,
      });
      y += lineH;
    }
    y += 6;  // gap between steps
  }

  return y;
}

// ─── Main render function ─────────────────────────────────────────────────────

export function renderKneeboardCard(canvas: HTMLCanvasElement, card: KneeboardCard): void {
  canvas.width = KNEEBOARD_WIDTH;
  canvas.height = KNEEBOARD_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.textBaseline = 'alphabetic';

  // Background
  fillRect(ctx, 0, 0, KNEEBOARD_WIDTH, KNEEBOARD_HEIGHT, C.bg);

  let y = 0;

  // 1. Header
  y = drawHeader(ctx, card);

  // 2. Target
  y = drawTargetSection(ctx, card, y);

  // 3. Weapon (compact)
  y = drawWeaponSection(ctx, card, y);

  // 4. Threats
  y = drawThreatsSection(ctx, card, y);

  // 5. Attack diagram (if we have geometry)
  if (card.attackSection.diagram) {
    y = drawAttackDiagram(ctx, card.attackSection.diagram, y);
  }

  // 6. Step-by-step
  if (card.attackSection.steps?.length) {
    y = drawSteps(ctx, card.attackSection.steps, y);
  }

  // 7. Footer
  fillRect(ctx, 0, KNEEBOARD_HEIGHT - 26, KNEEBOARD_WIDTH, 26, C.headerBg);
  txt(ctx, 'PHOENIX WEAPONEER', 10, KNEEBOARD_HEIGHT - 10, { size: 10, bold: true, family: MONO, color: '#667788' });
  txt(ctx, 'UNCLASSIFIED // TRAINING USE ONLY', KNEEBOARD_WIDTH / 2, KNEEBOARD_HEIGHT - 10, {
    size: 9, family: MONO, color: '#445566', align: 'center',
  });
}

/** Export canvas to base64 PNG string (strip the data URL prefix) */
export function canvasToBase64Png(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png').split(',')[1] ?? '';
}
