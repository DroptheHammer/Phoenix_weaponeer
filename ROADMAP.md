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

## Phase 2: Core Planning 🔄 IN PROGRESS

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

### 2.5 Attack Profile Calculator ❌ NOT STARTED
- [ ] Attack profile data model
- [ ] Popup CCIP calculator
  - Run-in parameters (altitude, speed, heading)
  - Pop distance and climb angle
  - Apex altitude
  - Dive angle and release altitude
  - Egress direction
- [ ] Attack profile UI component
- [ ] Link attacks to target waypoints
- [ ] Calculate/display attack geometry on map

### 2.6 Flight Roster Management ❌ NOT STARTED
- [ ] Flight member data model
- [ ] Add/edit flight members (1-4 per flight)
- [ ] Assign callsigns and positions
- [ ] Aircraft selection (F-16C initially)
- [ ] Loadout editor
  - Station-based weapon assignment
  - Fuze selection per weapon
  - Quantity per station
- [ ] Assign attacks to flight members

---

## Phase 3: Output ❌ NOT STARTED

### 3.1 Kneeboard Card Renderer
- [ ] 768x1024 pixel canvas
- [ ] Layout engine with sections:
  - Header (callsign, date, target)
  - Target info (coords, elevation, description)
  - Threats (nearby SAMs with bearing/range)
  - Attack profile (parameters table)
  - Weapon settings (fuze, release mode)
  - Egress/abort procedures
- [ ] Font rendering (readable at cockpit distance)
- [ ] PNG export

### 3.2 Export System
- [ ] File picker for output location
- [ ] Quick-pick for DCS kneeboard folder detection
- [ ] Batch export (all flight members)
- [ ] Filename convention (callsign_target_date.png)

### 3.3 PDF Export (Optional)
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

**Last Updated:** 2026-02-01

**Completed:** Phases 1.x, 2.1-2.4
**Next Up:** 2.5 Attack Profile Calculator

---

## Session Notes

Previous session fixed coordinate conversion - waypoints now display correctly on NTTR map using proj4 transformations with correct (y,x) coordinate ordering.
