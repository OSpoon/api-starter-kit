<script setup lang="ts">
import { Download, RefreshCw } from '@lucide/vue'
import { toast } from 'vue-sonner'

import AnalyticsPageTemplate from '@/components/templates/AnalyticsPageTemplate.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const range = ref('近 7 天'); const loading = ref(false); const page = ref(1)
async function refresh() { loading.value = true; await new Promise((resolve) => setTimeout(resolve, 500)); loading.value = false; toast.success('数据已刷新') }
</script>

<template>
  <AnalyticsPageTemplate title="运营分析" description="指标、筛选、加载状态和分页数据模板。"><template #actions><Button variant="outline" size="sm" @click="toast.success('报表已导出')"><Download class="
    size-4
  " /> 导出</Button><Button size="sm" :disabled="loading" @click="refresh"><RefreshCw class="
    size-4
  " :class="loading ? `animate-spin` : ''" /> 刷新</Button></template><template #filters><div class="
    flex gap-2
  "><Button v-for="option in ['近 7 天', '近 30 天', '本季度']" :key="option" size="sm" :variant="range === option ? 'secondary' : 'ghost'" @click="range = option">{{ option }}</Button></div><span class="
    text-sm text-muted-foreground
  ">当前范围：{{ range }}</span></template><template #metrics><Card v-for="item in [{label:'请求量',value:'128.4k'},{label:'成功率',value:'99.98%'},{label:'平均响应',value:'182ms'},{label:'活跃密钥',value:'24'}]" :key="item.label"><CardHeader class="
    pb-2
  "><CardDescription>{{ item.label }}</CardDescription></CardHeader><CardContent><Skeleton v-if="loading" class="
    h-8 w-20
  " /><div v-else class="text-2xl font-semibold">{{ item.value }}</div></CardContent></Card></template><Card><CardHeader><CardTitle>接口表现</CardTitle><CardDescription>按请求次数排序的接口明细。</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>接口</TableHead><TableHead>请求量</TableHead><TableHead>成功率</TableHead><TableHead class="
    w-48
  ">用量</TableHead></TableRow></TableHeader><TableBody><TableRow v-for="item in ['/v1/users', '/v1/api-keys', '/v1/ai-chat']" :key="item"><TableCell class="
    font-mono text-sm
  ">{{ item }}</TableCell><TableCell>24,680</TableCell><TableCell>99.9%</TableCell><TableCell><Progress :model-value="68" /></TableCell></TableRow></TableBody></Table><div class="
    mt-4 flex justify-end gap-2
  "><Button size="sm" variant="outline" :disabled="page === 1" @click="page--">上一页</Button><Button size="sm" variant="outline" @click="page++">第 {{ page }} 页</Button><Button size="sm" variant="outline" @click="page++">下一页</Button></div></CardContent></Card></AnalyticsPageTemplate>
</template>
