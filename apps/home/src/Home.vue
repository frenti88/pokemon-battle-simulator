<script setup>
import { onBeforeUnmount } from 'vue'
import { SPRITE_URLS } from '@battle/pokemon-sprites'
import { createExperienceAudio } from '../../shared/music/audio.js'

const audio = createExperienceAudio()
onBeforeUnmount(() => audio.dispose())

const experiences = [
  {
    id: 'multiplayer', number: '01', href: '/multiplayer', label: 'DESAFÍA A UN AMIGO',
    title: 'Batallas privadas', tag: 'DOS JUGADORES', action: 'Crear o unirse a una sala',
    description: 'Invita a un amigo a un duelo privado de Generación 3. Arma tu equipo, prepárense y enfréntense en el campo de batalla.',
    details: ['Jugadores invitados', 'Invitación privada'],
  },
  {
    id: 'simulation', number: '02', href: '/simulation', label: 'ELIGE TU DESAFÍO EN SOLITARIO',
    title: 'Simulación de batalla', tag: 'LIGA + SUPERVIVENCIA', action: 'Elige tu modo de batalla',
    description: 'Desafía una Liga Pokémon regional o descubre cuánto resiste tu equipo contra rivales infinitos. Arma tu equipo de seis y lucha en solitario.',
    details: ['Ligas regionales', 'Supervivencia infinita'],
  },
  {
    id: 'preview', number: '03', href: '/preview', label: 'MIRA DE CERCA',
    title: 'Previsualizador de movimientos', tag: '345 MOVIMIENTOS', action: 'Elige un movimiento',
    description: 'Elige entre 345 movimientos y los 151 Pokémon de Kanto. Observa cada animación con un resultado de batalla de muestra.',
    details: ['Cualquier perspectiva', 'Repite cualquier movimiento'],
  },
  {
    id: 'playground', number: '04', href: '/playground', label: 'EXPLORA LOS EFECTOS',
    title: 'Área de pruebas FX', tag: 'SOLO EFECTOS', action: 'Abrir área de pruebas',
    description: 'Explora la animación por sí sola. Ajusta el Pokémon, escala y campo de batalla, luego reprodúcela desde cualquier lado.',
    details: ['Controles de diseño', 'Movimiento reducido'],
  },
]
</script>

<template>
  <div class="home-shell">
    <a class="home-skip" href="#experiences">Saltar a las experiencias</a>
    <header class="home-header">
      <a class="home-brand" href="/" aria-label="Inicio Battle Lab"><span class="ball-mark" aria-hidden="true"></span><span>Battle Lab<span class="home-brand-dot">.</span></span></a>
      <nav class="home-navigation" aria-label="Navegación principal">
        <a href="/" aria-current="page">Inicio</a>
        <a href="/multiplayer">Multijugador</a>
        <a href="/simulation">Simulación</a>
        <a href="/preview">Movimientos</a>
        <a href="/playground">Pruebas FX</a>
      </nav>
    </header>

    <main>
      <section class="home-hero" aria-labelledby="home-title">
        <p class="home-eyebrow"><span aria-hidden="true"></span> UN TOQUE DE NOSTALGIA. UNA NUEVA FORMA DE JUGAR.</p>
        <h1 id="home-title">Elige tu siguiente movimiento.</h1>
        <p class="home-intro">Una batalla de Generación 3, un movimiento favorito o una mirada detallada a los efectos.<br class="home-desktop-break"> Hay un lugar para cada uno.</p>
        <div class="home-hero-art" aria-hidden="true">
          <div class="home-orbit home-orbit-outer"></div>
          <div class="home-orbit home-orbit-inner"></div>
          <span class="home-art-tick home-art-tick-left"></span>
          <span class="home-art-tick home-art-tick-right"></span>
          <div class="home-pokemon home-pokemon-blastoise"><img :src="SPRITE_URLS['blastoise-front.png']" alt="" width="96" height="96" decoding="async"></div>
          <div class="home-pokemon home-pokemon-charizard"><img :src="SPRITE_URLS['charizard-front.png']" alt="" width="96" height="96" decoding="async" fetchpriority="high"></div>
          <div class="home-pokemon home-pokemon-venusaur"><img :src="SPRITE_URLS['venusaur-front.png']" alt="" width="96" height="96" decoding="async"></div>
        </div>
        <div class="home-roster-note"><span>KANTO (#001–#151)</span><i aria-hidden="true"></i><span>151 POKÉMON</span><i aria-hidden="true"></i><span>345 EFECTOS DE MOVIMIENTO</span></div>
      </section>

      <section id="experiences" class="home-experiences" aria-labelledby="experiences-title" tabindex="-1">
        <div class="home-section-heading"><h2 id="experiences-title">Cuatro formas de jugar y explorar</h2><span>Elige tu punto de partida</span></div>
        <div class="home-card-grid">
          <a v-for="experience in experiences" :key="experience.id" :href="experience.href" class="home-card" :class="`home-card-${experience.id}`">
            <div class="home-card-top">
              <span class="home-card-icon" aria-hidden="true">
                <svg v-if="experience.id === 'simulation' || experience.id === 'multiplayer'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m4 4 5 1 10 13-3 3L5 9 4 4Z M17 3l3 1-1 4-3 3 M4 20l5-5 M3 17l4 4 M14 18l5-5"/></svg>
                <svg v-else-if="experience.id === 'preview'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="4"/><path d="m10 8 6 4-6 4V8Z"/></svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z M20 2v4 M18 4h4"/></svg>
              </span>
              <span class="home-card-tag">{{ experience.tag }}</span>
            </div>
            <p class="home-card-label">{{ experience.number }} <span aria-hidden="true">/</span> {{ experience.label }}</p>
            <h3>{{ experience.title }}</h3>
            <p class="home-card-description">{{ experience.description }}</p>
            <ul class="home-card-details"><li v-for="detail in experience.details" :key="detail">{{ detail }}</li></ul>
            <div class="home-card-action"><span>{{ experience.action }}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></div>
          </a>
        </div>
      </section>
    </main>

    <footer class="home-footer"><span>Una experiencia Pokémon creada por fans.</span><span>Pokémon © Nintendo / Game Freak <span aria-hidden="true">·</span> Sprites via <a href="https://github.com/PokeAPI/sprites" target="_blank" rel="noopener noreferrer">PokéAPI</a></span></footer>
  </div>
</template>
