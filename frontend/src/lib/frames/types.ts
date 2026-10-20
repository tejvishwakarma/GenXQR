/** Shapes recolour; premium and occasion frames are fixed artwork. */
export type FrameGroup = "shape" | "premium" | "occasion"

export type FrameFieldId =
  | "title" | "cta" | "brand" | "url" | "date" | "year" | "names" | "seat" | "monogram"
  /** Sample copy the pack left unnamed (taglines, ring text); ids added on import. */
  | "line1" | "line2" | "line3"

export interface FrameField {
  id: FrameFieldId
  /** The text the frame ships with; shown as the placeholder. */
  default: string
  /** Curved text (round badge, rosette): no automatic squeeze. */
  onPath: boolean
  family: string
  size: number
  weight: string
  italic: boolean
  letterSpacing: number
}

export interface FrameEntry {
  /** "<group>:<file>", stored in QRDesign.frameStyle. */
  id: string
  group: FrameGroup
  /** Gallery filter: everyday / objects / food / occasions for shapes, else the group. */
  category: string
  title: string
  width: number
  height: number
  /** Square the code goes in; its first child is the light panel. */
  slot: { x: number; y: number; size: number }
  fields: FrameField[]
  fonts: { family: string; italic: boolean }[]
  /** Shapes only. */
  defaultColor?: string
}
