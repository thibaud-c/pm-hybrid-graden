<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import maplibregl, { type GeoJSONSource, type MapGeoJSONFeature, type Marker } from 'maplibre-gl'
import { cellToBoundary, latLngToCell } from 'h3-js'
import { feelings, type Location, type Observation } from '../types'
import { h3Resolution, measurementRadius } from '../mapMath'

const props = withDefaults(defineProps<{
  observations: Observation[]
  selectedLocation?: Location | null
  placing?: boolean
  mode?: 'collection' | 'points' | 'h3'
  pointStyle?: 'measurements' | 'feelings' | 'plants'
}>(), { selectedLocation: null, placing: false, mode: 'collection', pointStyle: 'measurements' })
const emit = defineEmits<{ observation: [observation: Observation]; location: [location: Location] }>()

const container = ref<HTMLElement>()
let map: maplibregl.Map | null = null
let locationMarker: Marker | null = null
let domMarkers: Marker[] = []
let fitted = false
const values = computed(() => props.observations.map((item) => item.plantReading))
const emoji = Object.fromEntries(feelings.map(([name, face]) => [name, face]))

const features = () => ({
  type: 'FeatureCollection' as const,
  features: props.observations.map((observation) => ({
    type: 'Feature' as const,
    properties: {
      id: observation.id,
      color: observation.sensorColor,
      radius: props.mode === 'collection' ? 9 : measurementRadius(observation.plantReading, values.value),
    },
    geometry: { type: 'Point' as const, coordinates: [observation.longitude, observation.latitude] },
  })),
})

function clearDomMarkers() {
  domMarkers.forEach((marker) => marker.remove())
  domMarkers = []
}

function h3Features() {
  if (!map) return { type: 'FeatureCollection' as const, features: [] }
  const resolution = h3Resolution(map.getZoom(), map.getCenter().lat)
  const counts = new Map<string, number>()
  for (const item of props.observations) {
    const cell = latLngToCell(item.latitude, item.longitude, resolution)
    counts.set(cell, (counts.get(cell) ?? 0) + 1)
  }
  return {
    type: 'FeatureCollection' as const,
    features: [...counts].map(([cell, count]) => {
      const ring = cellToBoundary(cell).map(([lat, lng]) => [lng, lat])
      ring.push(ring[0])
      return {
        type: 'Feature' as const,
        properties: { count },
        geometry: { type: 'Polygon' as const, coordinates: [ring] },
      }
    }),
  }
}

function render() {
  if (!map?.isStyleLoaded()) return
  clearDomMarkers()
  ;(map.getSource('observations') as GeoJSONSource)?.setData(features())
  ;(map.getSource('h3') as GeoJSONSource)?.setData(h3Features())
  const showCircles = props.mode === 'collection' || (props.mode === 'points' && props.pointStyle === 'measurements')
  map.setLayoutProperty('observations-layer', 'visibility', showCircles ? 'visible' : 'none')
  map.setLayoutProperty('h3-layer', 'visibility', props.mode === 'h3' ? 'visible' : 'none')

  if (props.mode === 'points' && props.pointStyle !== 'measurements') {
    // ponytail: DOM markers are sufficient for the POC; switch to a symbol atlas only if volume proves it necessary.
    for (const observation of props.observations) {
      const element = document.createElement('button')
      element.type = 'button'
      if (props.pointStyle === 'feelings') {
        if (observation.feeling) {
          element.className = 'emoji-marker'
          element.textContent = emoji[observation.feeling]
          element.setAttribute('aria-label', observation.feeling)
        } else {
          element.className = 'missing-feeling-marker'
          element.setAttribute('aria-label', 'No Observer Feeling')
        }
      } else {
        const size = measurementRadius(observation.plantReading, values.value) * 1.8
        element.className = 'plant-marker'
        element.style.color = observation.sensorColor
        element.style.width = `${size}px`
        element.style.height = `${size}px`
        element.setAttribute('aria-label', `Plant Reading ${observation.plantReading}`)
        element.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M31 59V31C14 30 7 20 6 5c15 1 25 8 26 21C35 14 45 8 59 7c-1 17-10 27-25 28v24z"/><path fill="none" stroke="white" stroke-width="3" stroke-linecap="round" d="M32 32 17 15m16 18 13-13"/></svg>'
      }
      element.addEventListener('click', () => emit('observation', observation))
      domMarkers.push(new maplibregl.Marker({ element }).setLngLat([observation.longitude, observation.latitude]).addTo(map))
    }
  }

  if (!fitted && props.observations.length) {
    const bounds = new maplibregl.LngLatBounds()
    props.observations.forEach((item) => bounds.extend([item.longitude, item.latitude]))
    map.fitBounds(bounds, { padding: 70, maxZoom: 16, duration: 0 })
    fitted = true
  }
}

function updateLocation() {
  if (!map || !props.selectedLocation) {
    locationMarker?.remove()
    locationMarker = null
    return
  }
  const coordinates: [number, number] = [props.selectedLocation.longitude, props.selectedLocation.latitude]
  if (!locationMarker) {
    locationMarker = new maplibregl.Marker({ color: '#25633d', draggable: true })
      .setLngLat(coordinates)
      .addTo(map)
    locationMarker.on('dragend', () => {
      const point = locationMarker!.getLngLat()
      emit('location', { latitude: point.lat, longitude: point.lng, accuracyM: null })
    })
    map.flyTo({ center: coordinates, zoom: Math.max(map.getZoom(), 16) })
  } else {
    locationMarker.setLngLat(coordinates)
  }
}

onMounted(() => {
  map = new maplibregl.Map({
    container: container.value!,
    center: [15.4395, 47.0707],
    zoom: 13,
    style: {
      version: 8,
      sources: {
        carto: {
          type: 'raster',
          tiles: ['https://basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png'],
          tileSize: 256,
          attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        },
      },
      layers: [{ id: 'carto', type: 'raster', source: 'carto' }],
    },
  })
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
  map.on('load', () => {
    map!.addSource('observations', { type: 'geojson', data: features() })
    map!.addLayer({
      id: 'observations-layer',
      type: 'circle',
      source: 'observations',
      paint: {
        'circle-radius': ['get', 'radius'],
        'circle-color': ['get', 'color'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
        'circle-opacity': 0.9,
      },
    })
    map!.addSource('h3', { type: 'geojson', data: h3Features() })
    map!.addLayer({
      id: 'h3-layer',
      type: 'fill',
      source: 'h3',
      paint: {
        'fill-color': ['interpolate', ['linear'], ['get', 'count'], 1, '#dff1dc', 5, '#6fae72', 15, '#185c39'],
        'fill-opacity': 0.78,
        'fill-outline-color': '#ffffff',
      },
    })
    map!.on('click', 'observations-layer', (event) => {
      const id = (event.features?.[0] as MapGeoJSONFeature | undefined)?.properties?.id
      const observation = props.observations.find((item) => item.id === id)
      if (observation) emit('observation', observation)
    })
    map!.on('click', 'h3-layer', (event) => {
      const count = event.features?.[0]?.properties?.count
      if (count) new maplibregl.Popup().setLngLat(event.lngLat).setText(`${count} Observation${count === 1 ? '' : 's'}`).addTo(map!)
    })
    map!.on('click', (event) => {
      if (props.placing) emit('location', { latitude: event.lngLat.lat, longitude: event.lngLat.lng, accuracyM: null })
    })
    map!.on('zoomend', render)
    render()
    updateLocation()
  })
})

watch(() => [props.observations, props.mode, props.pointStyle], () => nextTick(render), { deep: true })
watch(() => props.selectedLocation, updateLocation, { deep: true })
onBeforeUnmount(() => { clearDomMarkers(); locationMarker?.remove(); map?.remove() })
</script>

<template><div ref="container" class="map" aria-label="Observation map"></div></template>
