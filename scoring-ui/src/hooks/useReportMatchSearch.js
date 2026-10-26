import { useCallback, useMemo, useState } from 'react'
import * as api from '../api'

export function useReportMatchSearch() {
  const [searchText, setSearchText] = useState('')
  const [allResults, setAllResults] = useState([])
  const [searched, setSearched] = useState(false)
  const [filterType, setFilterType] = useState('all')
  const [filterSport, setFilterSport] = useState('all')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [selected, setSelected] = useState(new Set())

  const resetSearchState = useCallback(() => {
    setSearchText('')
    setAllResults([])
    setSearched(false)
    setFilterType('all')
    setFilterSport('all')
    setFilterDateFrom('')
    setFilterDateTo('')
    setSelected(new Set())
  }, [])

  const handleSearch = useCallback(async (e, { withSessionCheck, setLoading, setError }) => {
    if (e) e.preventDefault()
    if (!searchText.trim() || searchText.length < 2) return
    setLoading(true)
    setError(null)
    setSearched(false)
    try {
      await withSessionCheck(async () => {
        const data = await api.searchMatches(searchText)
        setAllResults(data)
        setSearched(true)
        setSelected(new Set())
        setFilterType('all')
        setFilterSport('all')
        setFilterDateFrom('')
        setFilterDateTo('')
      })
    } catch (err) {
      if (!(err instanceof api.SessionExpiredError)) {
        setError(err.message)
      }
    }
    setLoading(false)
  }, [searchText])

  const sportOptions = useMemo(() => [...new Set(
    allResults.map(result => result.rule).filter(Boolean)
  )].sort(), [allResults])

  const isCup = useCallback(
    item => item.componentMatches && item.componentMatches.length > 0,
    []
  )

  const matchContentTypeMap = useMemo(() => {
    const contentTypes = new Map()
    for (const item of allResults) {
      if (isCup(item)) {
        for (const match of item.componentMatches) {
          contentTypes.set(match.id, 91)
        }
      } else {
        contentTypes.set(item.id, item.contentType)
      }
    }
    return contentTypes
  }, [allResults, isCup])

  const filteredResults = useMemo(() => allResults.filter(item => {
    if (filterType === 'cup' && !isCup(item)) return false
    if (filterType === 'match' && isCup(item)) return false
    if (filterSport !== 'all' && item.rule !== filterSport) return false
    if (filterDateFrom && item.starts < filterDateFrom) return false
    if (filterDateTo && item.starts > filterDateTo + 'T23:59:59') return false
    return true
  }), [allResults, filterType, filterSport, filterDateFrom, filterDateTo, isCup])

  const getMatchIdsForItem = useCallback(item => {
    if (item.componentMatches && item.componentMatches.length > 0) {
      return item.componentMatches.map(match => match.id)
    }
    return [item.id]
  }, [])

  const getAllFilteredMatchIds = useCallback(
    () => filteredResults.flatMap(item => getMatchIdsForItem(item)),
    [filteredResults, getMatchIdsForItem]
  )

  const toggleItem = useCallback((item) => {
    setSelected(previous => {
      const next = new Set(previous)
      const ids = getMatchIdsForItem(item)
      if (ids.every(id => next.has(id))) {
        ids.forEach(id => next.delete(id))
      } else {
        ids.forEach(id => next.add(id))
      }
      return next
    })
  }, [getMatchIdsForItem])

  const toggleAll = useCallback(() => {
    const allIds = getAllFilteredMatchIds()
    if (allIds.length > 0 && allIds.every(id => selected.has(id))) {
      setSelected(previous => {
        const next = new Set(previous)
        allIds.forEach(id => next.delete(id))
        return next
      })
    } else {
      setSelected(previous => new Set([...previous, ...allIds]))
    }
  }, [getAllFilteredMatchIds, selected])

  const isItemSelected = useCallback((item) => {
    const ids = getMatchIdsForItem(item)
    return ids.length > 0 && ids.every(id => selected.has(id))
  }, [getMatchIdsForItem, selected])

  return {
    searchText,
    setSearchText,
    allResults,
    setAllResults,
    searched,
    setSearched,
    filterType,
    setFilterType,
    filterSport,
    setFilterSport,
    filterDateFrom,
    setFilterDateFrom,
    filterDateTo,
    setFilterDateTo,
    selected,
    setSelected,
    resetSearchState,
    handleSearch,
    sportOptions,
    matchContentTypeMap,
    filteredResults,
    getAllFilteredMatchIds,
    toggleItem,
    toggleAll,
    isItemSelected,
  }
}
