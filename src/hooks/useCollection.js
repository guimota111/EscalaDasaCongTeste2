import { useState, useEffect } from 'react'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase'

export function useCollection(collectionName, orderField) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = orderField
      ? query(collection(db, collectionName), orderBy(orderField))
      : collection(db, collectionName)

    const unsub = onSnapshot(q, (snap) => {
      setData(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
      setLoading(false)
    })
    return unsub
  }, [collectionName, orderField])

  return { data, loading }
}
