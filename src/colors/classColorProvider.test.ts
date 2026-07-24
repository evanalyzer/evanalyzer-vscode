import { describe, expect, it } from "vitest";
import { createTestDocument } from "../test/testDocument";
import { Color } from "../test/vscode-mock";
import { ClassColorProvider } from "./classColorProvider";

const provider = new ClassColorProvider();

describe("ClassColorProvider.provideDocumentColors", () => {
  it("finds a color swatch for a Class.color value and decodes it correctly", () => {
    const text = JSON.stringify({ classification: { classes: [{ id: { VALID: 0 }, color: "#3399ff", name: "" }] } });
    const document = createTestDocument(text, "test.evapt");

    const results = provider.provideDocumentColors(document as never);

    expect(results).toHaveLength(1);
    // #3399ff -> r=0x33/255, g=0x99/255, b=0xff/255
    expect(results[0].color.red).toBeCloseTo(0x33 / 255, 5);
    expect(results[0].color.green).toBeCloseTo(0x99 / 255, 5);
    expect(results[0].color.blue).toBeCloseTo(0xff / 255, 5);
    expect(results[0].color.alpha).toBe(1);
  });

  it("accepts uppercase hex (deserializer is case-insensitive per the Rust source)", () => {
    const text = JSON.stringify({ color: "#3399FF" });
    const document = createTestDocument(text, "test.evapt");
    expect(provider.provideDocumentColors(document as never)).toHaveLength(1);
  });

  it("ignores a 'color' key whose value isn't a 6-digit hex string", () => {
    const text = JSON.stringify({ color: "not-a-color", other: { color: "#fff" } });
    const document = createTestDocument(text, "test.evapt");
    expect(provider.provideDocumentColors(document as never)).toHaveLength(0);
  });

  it("ignores hex-shaped strings under any key other than 'color' (e.g. range/HSV fields elsewhere in the schema)", () => {
    const text = JSON.stringify({ notColor: "#3399ff" });
    const document = createTestDocument(text, "test.evapt");
    expect(provider.provideDocumentColors(document as never)).toHaveLength(0);
  });

  it("finds every color in a document with multiple classes", () => {
    const text = JSON.stringify({ classes: [{ color: "#ff0000" }, { color: "#00ff00" }, { color: "#0000ff" }] });
    const document = createTestDocument(text, "test.evapt");
    expect(provider.provideDocumentColors(document as never)).toHaveLength(3);
  });
});

describe("ClassColorProvider.provideColorPresentations", () => {
  it("round-trips a color back to lowercase #rrggbb, matching the Rust serializer's format", () => {
    const presentations = provider.provideColorPresentations(new Color(0x33 / 255, 0x99 / 255, 0xff / 255, 1) as never);
    expect(presentations[0].label).toBe('"#3399ff"');
  });

  it("clamps out-of-range channel values rather than producing invalid hex", () => {
    const presentations = provider.provideColorPresentations(new Color(2, -1, 0.5, 1) as never);
    expect(presentations[0].label).toMatch(/^"#[0-9a-f]{6}"$/);
  });
});
