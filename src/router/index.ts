import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  // hash 模式：静态部署/file:// 双击打开均可用
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/event/:id',
      name: 'event',
      component: () => import('@/views/EventView.vue'),
    },
    {
      path: '/guest/:id',
      name: 'guest',
      component: () => import('@/views/GuestScreenView.vue'),
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

export default router
