/**
 * MandiLedgerTemplate — "Mandi Ledger" A4 print template.
 *
 * Palette: paper #F4EEDD, card #FBF7EA, ink #241F16, forest #1F3D2B / #132A1C,
 *          turmeric #E0A03B, stamp red #AD3A2C, line #D9CDA9
 * Fonts: Fraunces (display/italic category titles), IBM Plex Sans (body), IBM Plex Mono (data)
 * Structure: dark forest masthead → category bands → 3-col hanging tag cards → dashed footer
 */

"use client";

import React from "react";
import type { TemplateProps, CatalogueCategory, CatalogueItem } from "./templateRegistry";

/* ── colour tokens ─────────────────────────────────────────────── */
const C = {
  paper: "#F4EEDD",
  card: "#FBF7EA",
  ink: "#241F16",
  forest: "#1F3D2B",
  forestDark: "#132A1C",
  turmeric: "#E0A03B",
  stampRed: "#AD3A2C",
  line: "#D9CDA9",
  lineLight: "#E8DFC6",
} as const;

/* ── Masthead ──────────────────────────────────────────────────── */
function Masthead({ outletInfo }: Pick<TemplateProps, "outletInfo">) {
  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${C.forestDark} 0%, ${C.forest} 100%)`,
        padding: "20px 28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      {/* Brand side */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {outletInfo.logo_url && (
          <img
            src={outletInfo.logo_url}
            alt=""
            style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", border: `2px solid ${C.turmeric}` }}
          />
        )}
        <div>
          <div
            style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 22,
              fontWeight: 700,
              color: "#fff",
              lineHeight: 1.1,
            }}
          >
            {outletInfo.name}
          </div>
          {outletInfo.address && (
            <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 9, color: "rgba(255,255,255,0.7)", marginTop: 3 }}>
              {outletInfo.address}
            </div>
          )}
        </div>
      </div>

      {/* Contact side */}
      <div style={{ textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: "rgba(255,255,255,0.75)", lineHeight: 1.6 }}>
        {outletInfo.phone && <div>☎ {outletInfo.phone}</div>}
        {outletInfo.gstin && <div>GSTIN: {outletInfo.gstin}</div>}
        {outletInfo.fssai_no && <div>FSSAI: {outletInfo.fssai_no}</div>}
      </div>
    </div>
  );
}

/* ── Category band ─────────────────────────────────────────────── */
function CategoryBand({ category }: { category: CatalogueCategory }) {
  return (
    <div
      style={{
        borderBottom: `2px solid ${C.forest}`,
        padding: "10px 28px 6px",
        display: "flex",
        alignItems: "baseline",
        gap: 10,
      }}
    >
      <span
        style={{
          fontFamily: "'Fraunces', serif",
          fontStyle: "italic",
          fontSize: 16,
          fontWeight: 600,
          color: C.forest,
        }}
      >
        {category.name_en}
      </span>
      {category.name_hi && (
        <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 11, color: C.ink, opacity: 0.55 }}>
          {category.name_hi}
        </span>
      )}
    </div>
  );
}

/* ── Product card (hanging tag) ────────────────────────────────── */
function ProductCard({ item }: { item: CatalogueItem }) {
  const save = item.mrp - item.price;
  const showStamp = save > 0;

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.line}`,
        borderRadius: 8,
        padding: "10px 10px 8px",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minHeight: 100,
      }}
    >
      {/* Stamp badge */}
      {showStamp && (
        <div
          style={{
            position: "absolute",
            top: 6,
            right: -8,
            transform: "rotate(12deg)",
            background: C.stampRed,
            color: "#fff",
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 8,
            fontWeight: 700,
            padding: "2px 12px 2px 8px",
            borderRadius: 2,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            lineHeight: 1.4,
          }}
        >
          SAVE ₹{save.toFixed(0)}
        </div>
      )}

      {/* Image + Name row */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        {item.image_url ? (
          <img
            src={item.image_url}
            alt=""
            style={{
              width: 40,
              height: 40,
              borderRadius: 6,
              objectFit: "cover",
              border: `1px solid ${C.lineLight}`,
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 6,
              background: C.lineLight,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
            }}
          >
            🌿
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "'IBM Plex Sans', sans-serif",
              fontSize: 11,
              fontWeight: 600,
              color: C.ink,
              lineHeight: 1.3,
              wordBreak: "break-word",
            }}
          >
            {item.name_en}
          </div>
          {item.name_hi && (
            <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 9, color: C.ink, opacity: 0.5, marginTop: 1 }}>
              {item.name_hi}
            </div>
          )}
        </div>
      </div>

      {/* Price row */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          borderTop: `1px dashed ${C.line}`,
          paddingTop: 5,
          marginTop: "auto",
        }}
      >
        <div>
          {item.mrp > item.price && (
            <span
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 9,
                color: C.ink,
                opacity: 0.45,
                textDecoration: "line-through",
                marginRight: 5,
              }}
            >
              ₹{item.mrp.toFixed(0)}
            </span>
          )}
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 14,
              fontWeight: 700,
              color: C.forest,
            }}
          >
            ₹{item.price.toFixed(0)}
          </span>
        </div>
        {item.discount_pct > 0 && (
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 9,
              fontWeight: 600,
              color: C.turmeric,
            }}
          >
            {item.discount_pct}% OFF
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Footer ────────────────────────────────────────────────────── */
function Footer({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) {
  return (
    <div
      style={{
        borderTop: `2px dashed ${C.line}`,
        padding: "8px 28px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 8,
        color: C.ink,
        opacity: 0.6,
      }}
    >
      <span>Prices valid as of print date. Subject to change.</span>
      <span
        style={{
          background: C.forest,
          color: "#fff",
          padding: "2px 10px",
          borderRadius: 3,
          fontSize: 8,
          fontWeight: 600,
        }}
      >
        Page {pageNumber} of {totalPages}
      </span>
    </div>
  );
}

/* ── Main template ─────────────────────────────────────────────── */
export function MandiLedgerTemplate({ batch, pageNumber, totalPages, outletInfo }: TemplateProps) {
  return (
    <div
      className="mandi-ledger-page"
      style={{
        width: 794,
        minHeight: 1123,
        maxHeight: 1123,
        background: C.paper,
        fontFamily: "'IBM Plex Sans', sans-serif",
        color: C.ink,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxSizing: "border-box",
        pageBreakAfter: "always",
      }}
    >
      <Masthead outletInfo={outletInfo} />

      {/* Body — categories and items */}
      <div style={{ flex: 1, overflow: "hidden", padding: "0 0 4px" }}>
        {batch.categories.map((cat) => (
          <div key={cat.id} style={{ pageBreakInside: "avoid" }}>
            <CategoryBand category={cat} />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 10,
                padding: "10px 28px",
              }}
            >
              {cat.items.map((item) => (
                <ProductCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <Footer pageNumber={pageNumber} totalPages={totalPages} />
    </div>
  );
}
