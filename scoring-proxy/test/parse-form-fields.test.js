// ============================================================
// Unit tests for parseFormFields — HTML form field extraction
//
// Tests the generic form parser that extracts fields from SSI
// creation pages. Critical for multi-discipline support:
// - Nordic forms use <select multiple> for weapon_groups
// - SRA forms use multiple hidden <input> with same name
// - Both use checkboxes for categories, firearms
// ============================================================

import { describe, it, expect } from 'vitest'
import { parseFormFields } from '../lib/services/event-creation-service.js'

// ============================================================
// Basic input extraction
// ============================================================

describe('parseFormFields — basic inputs', () => {
  it('extracts hidden input', () => {
    const html = '<input type="hidden" name="csrfmiddlewaretoken" value="abc123">'
    const { fields } = parseFormFields(html)
    expect(fields.csrfmiddlewaretoken).toBe('abc123')
  })

  it('extracts text input', () => {
    const html = '<input type="text" name="name" value="My Event">'
    const { fields } = parseFormFields(html)
    expect(fields.name).toBe('My Event')
  })

  it('ignores submit and button inputs', () => {
    const html = `
      <input type="submit" name="save" value="Save">
      <input type="button" name="cancel" value="Cancel">
      <input type="text" name="name" value="Keep">
    `
    const { fields } = parseFormFields(html)
    expect(fields.name).toBe('Keep')
    expect(fields.save).toBeUndefined()
    expect(fields.cancel).toBeUndefined()
  })

  it('extracts checkbox only if checked', () => {
    const html = `
      <input type="checkbox" name="active" value="on" checked>
      <input type="checkbox" name="hidden" value="on">
    `
    const { fields } = parseFormFields(html)
    expect(fields.active).toBe('on')
    expect(fields.hidden).toBeUndefined()
  })
})

// ============================================================
// SRA-style: multiple hidden inputs with same name (array)
// ============================================================

describe('parseFormFields — SRA duplicate hidden inputs → array', () => {
  it('promotes duplicate hidden inputs to arrayFields', () => {
    const html = `
      <input type="hidden" name="handgun_divs" value="hg1" id="id_handgun_divs_0">
      <input type="hidden" name="handgun_divs" value="hg2" id="id_handgun_divs_1">
      <input type="hidden" name="handgun_divs" value="hg3" id="id_handgun_divs_2">
    `
    const { fields, arrayFields } = parseFormFields(html)
    expect(fields.handgun_divs).toBeUndefined()
    expect(arrayFields.handgun_divs).toEqual(['hg1', 'hg2', 'hg3'])
  })

  it('handles single hidden input as scalar', () => {
    const html = '<input type="hidden" name="timezone" value="Europe/Helsinki">'
    const { fields, arrayFields } = parseFormFields(html)
    expect(fields.timezone).toBe('Europe/Helsinki')
    expect(arrayFields.timezone).toBeUndefined()
  })

  it('handles mix of scalar and array fields', () => {
    const html = `
      <input type="hidden" name="name" value="My Match">
      <input type="hidden" name="handgun_divs" value="hg1" id="id_handgun_divs_0">
      <input type="hidden" name="handgun_divs" value="hg2" id="id_handgun_divs_1">
      <input type="hidden" name="rifle_divs" value="rf1" id="id_rifle_divs_0">
      <input type="hidden" name="rifle_divs" value="rf2" id="id_rifle_divs_1">
      <input type="hidden" name="group" value="xxx">
    `
    const { fields, arrayFields } = parseFormFields(html)
    expect(fields.name).toBe('My Match')
    expect(fields.group).toBe('xxx')
    expect(arrayFields.handgun_divs).toEqual(['hg1', 'hg2'])
    expect(arrayFields.rifle_divs).toEqual(['rf1', 'rf2'])
  })

  it('handles SRA form with all division types', () => {
    // Realistic SRA form structure
    const html = `
      <form method="post" autocomplete="off">
        <input type="hidden" name="handgun_divs" value="hg1" id="id_handgun_divs_0">
        <input type="hidden" name="handgun_divs" value="hg2" id="id_handgun_divs_1">
        <input type="hidden" name="rifle_divs" value="rf1" id="id_rifle_divs_0">
        <input type="hidden" name="rifle_divs" value="rf2" id="id_rifle_divs_1">
        <input type="hidden" name="shotgun_divs" value="sg1" id="id_shotgun_divs_0">
        <input type="hidden" name="mini_rifle_divs" value="mr1" id="id_mini_rifle_divs_0">
        <input type="hidden" name="pcc_divs" value="pcc1" id="id_pcc_divs_0">
        <input type="text" name="name" value="">
        <input type="text" name="max_competitors" value="100">
        <input type="hidden" name="group" value="">
        <input type="hidden" name="organizer" value="">
      </form>
    `
    const { fields, arrayFields } = parseFormFields(html)
    expect(arrayFields.handgun_divs).toEqual(['hg1', 'hg2'])
    expect(arrayFields.rifle_divs).toEqual(['rf1', 'rf2'])
    expect(fields.shotgun_divs).toBe('sg1') // only one → stays scalar
    expect(fields.mini_rifle_divs).toBe('mr1')
    expect(fields.pcc_divs).toBe('pcc1')
    expect(fields.name).toBe('')
    expect(fields.max_competitors).toBe('100')
  })
})

// ============================================================
// Checkbox arrays (categories, firearms)
// ============================================================

describe('parseFormFields — checkbox arrays', () => {
  it('promotes multiple checked checkboxes to arrayFields', () => {
    const html = `
      <input class="form-check-input" type="checkbox" name="categories" value="Open" checked>
      <input class="form-check-input" type="checkbox" name="categories" value="Standard" checked>
      <input class="form-check-input" type="checkbox" name="categories" value="Lady">
    `
    const { fields, arrayFields } = parseFormFields(html)
    expect(fields.categories).toBeUndefined()
    expect(arrayFields.categories).toEqual(['Open', 'Standard'])
  })

  it('keeps single checked checkbox as scalar', () => {
    const html = `
      <input type="checkbox" name="is_live" value="on" checked>
      <input type="checkbox" name="prematch" value="on">
    `
    const { fields } = parseFormFields(html)
    expect(fields.is_live).toBe('on')
    expect(fields.prematch).toBeUndefined()
  })

  it('handles firearms checkboxes', () => {
    const html = `
      <input class="form-check-input" type="checkbox" name="firearms" value="hg" checked>
      <input class="form-check-input" type="checkbox" name="firearms" value="rf" checked>
      <input class="form-check-input" type="checkbox" name="firearms" value="sg" checked>
    `
    const { arrayFields } = parseFormFields(html)
    expect(arrayFields.firearms).toEqual(['hg', 'rf', 'sg'])
  })
})

// ============================================================
// Radio buttons — only checked value kept
// ============================================================

describe('parseFormFields — radio buttons', () => {
  it('keeps only checked radio value (not promoted to array)', () => {
    const html = `
      <input type="radio" name="rule" value="sr" checked>
      <input type="radio" name="rule" value="ip">
      <input type="radio" name="rule" value="sc">
    `
    const { fields, arrayFields } = parseFormFields(html)
    expect(fields.rule).toBe('sr')
    expect(arrayFields.rule).toBeUndefined()
  })

  it('ignores unchecked radio buttons', () => {
    const html = `
      <input type="radio" name="sub_rule" value="to">
      <input type="radio" name="sub_rule" value="ha">
    `
    const { fields } = parseFormFields(html)
    expect(fields.sub_rule).toBeUndefined()
  })

  it('does not confuse radio with checkbox arrays', () => {
    const html = `
      <input type="radio" name="rule" value="sr" checked>
      <input type="radio" name="rule" value="ip">
      <input type="checkbox" name="firearms" value="hg" checked>
      <input type="checkbox" name="firearms" value="rf" checked>
    `
    const { fields, arrayFields } = parseFormFields(html)
    expect(fields.rule).toBe('sr')
    expect(arrayFields.rule).toBeUndefined()
    expect(arrayFields.firearms).toEqual(['hg', 'rf'])
  })
})

// ============================================================
// Nordic-style: <select multiple> for weapon_groups
// ============================================================

describe('parseFormFields — select elements', () => {
  it('extracts single select with selected option', () => {
    const html = `
      <select name="visibility">
        <option value="pub" selected>Public</option>
        <option value="pri">Private</option>
      </select>
    `
    const { fields } = parseFormFields(html)
    expect(fields.visibility).toBe('pub')
  })

  it('extracts multiple select into arrayFields', () => {
    const html = `
      <select name="weapon_groups" multiple>
        <option value="STD" selected>Standard</option>
        <option value="OPN" selected>Open</option>
        <option value="PRD">Production</option>
      </select>
    `
    const { arrayFields } = parseFormFields(html)
    expect(arrayFields.weapon_groups).toEqual(['STD', 'OPN'])
  })

  it('returns empty string for select with no selected option', () => {
    const html = `
      <select name="group">
        <option value="">---------</option>
        <option value="25874">TurRes</option>
      </select>
    `
    const { fields } = parseFormFields(html)
    expect(fields.group).toBe('')
  })

  it('returns empty array for multiple select with no selected options', () => {
    const html = `
      <select name="categories" multiple>
        <option value="Open">Open</option>
        <option value="Standard">Standard</option>
      </select>
    `
    const { arrayFields } = parseFormFields(html)
    expect(arrayFields.categories).toEqual([])
  })
})

// ============================================================
// Textarea extraction
// ============================================================

describe('parseFormFields — textareas', () => {
  it('extracts textarea content', () => {
    const html = '<textarea name="description">Match description here</textarea>'
    const { fields } = parseFormFields(html)
    expect(fields.description).toBe('Match description here')
  })

  it('handles empty textarea', () => {
    const html = '<textarea name="information"></textarea>'
    const { fields } = parseFormFields(html)
    expect(fields.information).toBe('')
  })

  it('decodes HTML entities in textarea', () => {
    const html = '<textarea name="desc">A &amp; B &lt;tag&gt;</textarea>'
    const { fields } = parseFormFields(html)
    expect(fields.desc).toBe('A & B <tag>')
  })
})
