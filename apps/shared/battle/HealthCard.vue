<script setup>
import { computed } from 'vue'
const props = defineProps({ member: Object, opponent: Boolean, impact: Object })
const percentage = computed(() => props.member?.hp?.max ? Math.max(0, Math.min(100, props.member.hp.current / props.member.hp.max * 100)) : 0)
const status = computed(() => props.member?.fainted ? 'Debilitado' : ({ brn: 'Quemado', par: 'Paralizado', slp: 'Dormido', tox: 'Gravemente envenenado', psn: 'Envenenado', frz: 'Congelado' }[props.member?.condition] ?? ''))
</script>

<template>
  <section class="sim-health" :class="{ 'sim-health-own': !opponent }" :aria-label="opponent ? 'Pokémon activo del oponente' : 'Tu Pokémon activo'">
    <span v-if="impact && impact.memberId === member?.memberId" :key="impact.key" class="sim-health-impact" :class="[`sim-health-impact-${impact.kind}`, { 'sim-health-impact-reduced': impact.reducedMotion }]" :style="{ '--impact-duration': `${impact.durationMs}ms` }" aria-hidden="true"></span>
    <div class="sim-health-name"><h2>{{ member?.species || 'Esperando Pokémon' }}</h2><span>Nv. 100</span></div>
    <div class="sim-hp-line"><span>PS</span><div class="sim-hp-track" role="progressbar" :aria-label="`${member?.species || 'Pokémon'} PS`" :aria-valuenow="member?.hp?.current ?? 0" :aria-valuemax="member?.hp?.max ?? 100" aria-valuemin="0" :aria-valuetext="opponent ? `Barra de PS pública: aprox. ${Math.round(percentage)} por ciento` : `${member?.hp?.current ?? 0} de ${member?.hp?.max ?? 0} PS`">
      <span :style="{ width: `${percentage}%`, background: percentage <= 20 ? '#e48f83' : percentage <= 50 ? '#e5c078' : '#bddb7c' }"></span>
    </div></div>
    <div class="sim-health-bottom"><span>{{ opponent ? 'Barra de PS pública' : 'Tus PS' }}</span><strong>{{ opponent ? `≈ ${Math.round(percentage)}%` : member?.hp ? `${member.hp.current} / ${member.hp.max}` : '—' }}</strong></div>
    <span v-if="status" class="sim-status">{{ status }}</span>
  </section>
</template>
