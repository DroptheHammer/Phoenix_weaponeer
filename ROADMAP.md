# DCS Attack Planner - Full Development Roadmap

## Overview
Cross-platform desktop app for planning F-16 attack missions in DCS World.

**Core Workflow:** Import mission → Define threats → Plan attacks → Generate kneeboards

---

## Phase 1: Foundation ✅ COMPLETE

### 1.1 Project Setup ✅
- [x] Initialize Tauri + React + TypeScript project
- [x] Configure Vite build system
- [x] Set up Tailwind CSS

### 1.2 Data Layer ✅
- [x] SQLite integration with bundled databases
- [x] Threat system database (SAMs, AAA, MANPADS)
- [x] Weapon database (bombs, guided munitions)
- [x] Basic data models (Mission, Waypoint, ThreatInstance)

### 1.3 Import Pipeline ✅
- [x] FragOrders JSON import (file-based)
- [x] Parse waypoints, threats, bullseye
- [x] Theater detection (Nevada, Caucasus, etc.)

### 1.4 Infrastructure ✅
- [x] GitHub Actions for cross-platform releases
- [x] Zustand state management
- [x] Basic UI shell with tab navigation

---

## Phase 2: Core Planning ✅ COMPLETE

### 2.1 Map Visualization ✅
- [x] Leaflet map integration
- [x] Waypoint markers with steerpoint labels
- [x] Threat envelope rings (range circles)
- [x] Bullseye marker
- [x] Theater-appropriate map tiles

### 2.2 Threat Management ✅
- [x] Display mission threats (from import)
- [x] Add planning threats (user-added, visually distinct)
- [x] Threat picker from database
- [x] Delete threats

### 2.3 Map Interaction ✅
- [x] Click-to-add threats at location
- [x] Drag to reposition planning threats
- [x] Mission threats locked (not draggable)

### 2.4 Coordinate Conversion ✅
- [x] Proj4 integration for accurate transformations
- [x] Nevada (NTTR) projection support
- [x] Caucasus projection support
- [x] Correct (y,x) coordinate ordering

### 2.5 Attack Profile Calculator ✅
- [x] Attack profile data model
- [x] Popup CCIP calculator
  - [x] Run-in parameters (altitude, speed, heading)
  - [x] Pop distance and climb angle
  - [x] Apex altitude
  - [x] Dive angle and release altitude
  - [x] Egress direction
- [x] Attack profile UI component
- [x] Link attacks to target waypoints
- [x] Calculate/display attack geometry on map

### 2.6 Flight Roster Management ✅
- [x] Flight member data model
- [x] Add/edit flight members (1-4 per flight)
- [x] Assign callsigns and positions
- [x] Aircraft selection (F-16C initially)
- [x] Loadout editor (simple weapon type + quantity)
- [x] Assign attacks to flight members

---

## Phase 3: Output 🔄 IN PROGRESS

### 3.1 Kneeboard Card Renderer ✅
- [x] 768x1024 pixel canvas
- [x] Layout engine with sections:
  - [x] Header (callsign, date, target)
  - [x] Target info (coords, elevation, description)
  - [x] Threats (nearby SAMs with bearing/range)
  - [x] Attack profile diagram (side-view altitude profile)
  - [x] Weapon settings (fuze, release mode)
  - [x] Step-by-step procedures
- [x] Font rendering (readable at cockpit distance)
- [x] PNG export

### 3.2 Export System ✅
- [x] Native file picker for output location
- [x] Export selected attack card
- [x] Batch export (all flight members to folder)
- [ ] Quick-pick for DCS kneeboard folder detection (planned)

### 3.3 PDF Export (Optional) ❌ NOT STARTED
- [ ] Multi-card PDF generation
- [ ] Print-friendly layout

---

## Phase 4: Polish ❌ NOT STARTED

### 4.1 Enhanced Import
- [ ] FragOrders URL scraping (when API access available)
- [ ] .miz file parser (direct DCS mission import)
- [ ] Tacview XML import

### 4.2 Additional Aircraft
- [ ] F/A-18C Hornet
  - Weapon compatibility
  - Delivery modes (AUTO, CCIP, CCRP)
- [ ] A-10C II Warthog
  - GAU-8 gun runs
  - Extended weapon database

### 4.3 Additional Attack Profiles
- [ ] Level CCRP (GPS/laser guided)
- [ ] Loft CCRP (standoff delivery)
- [ ] Dive bomb (high-angle CCIP)
- [ ] Strafing runs

### 4.4 Mission Planning Enhancements
- [ ] Threat exposure calculator
- [ ] Ingress/egress route optimization
- [ ] Time-on-target planning
- [ ] Weather considerations

### 4.5 Quality of Life
- [ ] Mission save/load to JSON files
- [ ] Recently used missions list
- [ ] Copy/paste attacks between flight members
- [ ] Undo/redo for planning changes

---

## Current Status

**Last Updated:** 2026-03-29

**Completed:**
- Phase 1: Foundation (all sections)
- Phase 2: Core Planning (all sections 2.1-2.6)
- Phase 3: Output (sections 3.1-3.2 complete, 3.3 not started)

**Next Up:**
- Phase 3.2 enhancement: DCS kneeboard folder quick-pick
- Phase 4: Polish features

---

## Session Notes

**2026-03-29:** Roadmap updated to reflect completion of Phase 2 and progress on Phase 3. Kneeboard card generation and export system now fully functional.

**2026-02-16:** Completed kneeboard card renderer with canvas-based PNG generation, attack profile diagrams, and native file export dialogs.

**2026-02-01:** Fixed coordinate conversion - waypoints now display correctly on NTTR map using proj4 transformations with correct (y,x) coordinate ordering.
