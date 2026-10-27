import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { searchMatches } from '../api'
import { useReportMatchSearch } from '../hooks/useReportMatchSearch'

vi.mock('../api', () => ({
  searchMatches: vi.fn(),
  SessionExpiredError: class SessionExpiredError extends Error {},
}))

const results = [
  {
    id: 'cup-1',
    rule: 'IPSC',
    starts: '2026-04-01T09:00:00',
    componentMatches: [{ id: 'match-1' }, { id: 'match-2' }],
  },
  {
    id: 'match-3',
    contentType: 42,
    rule: 'SRA',
    starts: '2026-04-15T09:00:00',
  },
  {
    id: 'match-4',
    contentType: 51,
    rule: 'IPSC',
    starts: '2026-05-01T09:00:00',
  },
]

describe('useReportMatchSearch', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('derives sport options, date/type filters, and match content types', () => {
    const { result } = renderHook(() => useReportMatchSearch())

    act(() => result.current.setAllResults(results))

    expect(result.current.sportOptions).toEqual(['IPSC', 'SRA'])
    expect(result.current.matchContentTypeMap).toEqual(new Map([
      ['match-1', 91],
      ['match-2', 91],
      ['match-3', 42],
      ['match-4', 51],
    ]))

    act(() => {
      result.current.setFilterType('cup')
      result.current.setFilterDateTo('2026-04-30')
    })

    expect(result.current.filteredResults).toEqual([results[0]])
  })

  it('selects and deselects component matches and filtered results', () => {
    const { result } = renderHook(() => useReportMatchSearch())

    act(() => {
      result.current.setAllResults(results)
      result.current.toggleItem(results[0])
    })

    expect(result.current.selected).toEqual(new Set(['match-1', 'match-2']))
    expect(result.current.isItemSelected(results[0])).toBe(true)

    act(() => result.current.toggleAll())
    expect(result.current.selected).toEqual(new Set(['match-1', 'match-2', 'match-3', 'match-4']))

    act(() => result.current.toggleAll())
    expect(result.current.selected).toEqual(new Set())
  })

  it('searches valid terms and resets filters and selection after success', async () => {
    searchMatches.mockResolvedValue(results)
    const { result } = renderHook(() => useReportMatchSearch())
    const setLoading = vi.fn()
    const setError = vi.fn()
    const withSessionCheck = fn => fn()

    act(() => {
      result.current.setSearchText('match')
      result.current.setFilterType('match')
      result.current.setFilterSport('SRA')
      result.current.setFilterDateFrom('2026-04-01')
      result.current.setFilterDateTo('2026-04-30')
      result.current.setSelected(new Set(['match-3']))
    })

    await act(async () => {
      await result.current.handleSearch(null, { withSessionCheck, setLoading, setError })
    })

    expect(searchMatches).toHaveBeenCalledWith('match')
    expect(result.current.allResults).toEqual(results)
    expect(result.current.searched).toBe(true)
    expect(result.current.filterType).toBe('all')
    expect(result.current.filterSport).toBe('all')
    expect(result.current.filterDateFrom).toBe('')
    expect(result.current.filterDateTo).toBe('')
    expect(result.current.selected).toEqual(new Set())
    expect(setLoading).toHaveBeenNthCalledWith(1, true)
    expect(setLoading).toHaveBeenLastCalledWith(false)
  })
})
