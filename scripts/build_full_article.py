# -*- coding: utf-8 -*-
"""
Script de geração do Artigo Científico - GAAP Virtual Lab V2.
Gera o documento .docx completo, com rigor acadêmico, linguagem clara e humilde,
formatação padronizada (ABNT/Word), equações limpas, blocos de código JSDoc
e tabelas comparativas detalhadas.
"""

import os
import docx
from docx.shared import Inches, Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import parse_xml, OxmlElement
from docx.oxml.ns import nsdecls, qn

def create_full_article(output_path):
    doc = docx.Document()

    # 1. Configuração de Página (Tamanho Carta, Margens ABNT: Sup/Esq 3.0cm, Inf/Dir 2.0cm)
    for section in doc.sections:
        section.page_width = Cm(21.59)
        section.page_height = Cm(27.94)
        section.top_margin = Cm(3.0)
        section.bottom_margin = Cm(2.0)
        section.left_margin = Cm(3.0)
        section.right_margin = Cm(2.0)

    # 2. Definição / Ajuste de Estilos
    try:
        normal_style = doc.styles['Normal']
    except KeyError:
        normal_style = doc.styles['normal']
    normal_style.font.name = 'Times New Roman'
    normal_style.font.size = Pt(12)
    normal_style.font.color.rgb = RGBColor(0x22, 0x22, 0x22)
    normal_style.paragraph_format.line_spacing = 1.5
    normal_style.paragraph_format.space_after = Pt(6)

    # Cores padronizadas
    COLOR_PRIMARY = RGBColor(0x0F, 0x2D, 0x59)     # Azul escuro acadêmico
    COLOR_SECONDARY = RGBColor(0x24, 0x3A, 0x5E)   # Azul ardósia
    COLOR_TEXT = RGBColor(0x22, 0x22, 0x22)        # Cinza quase preto
    COLOR_MUTED = RGBColor(0x55, 0x55, 0x55)       # Cinza médio para legendas

    # Funções Auxiliares de Formatação
    def add_title(text):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(12)
        p.paragraph_format.space_after = Pt(14)
        p.paragraph_format.line_spacing = 1.15
        run = p.add_run(text)
        run.font.name = 'Times New Roman'
        run.font.size = Pt(16)
        run.font.bold = True
        run.font.color.rgb = COLOR_PRIMARY
        return p

    def add_authors(authors_text, affiliation_text):
        p_auth = doc.add_paragraph()
        p_auth.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_auth.paragraph_format.space_before = Pt(0)
        p_auth.paragraph_format.space_after = Pt(4)
        r_auth_label = p_auth.add_run("Autores: ")
        r_auth_label.font.name = 'Times New Roman'
        r_auth_label.font.size = Pt(10.5)
        r_auth_label.font.bold = True
        r_auth = p_auth.add_run(authors_text)
        r_auth.font.name = 'Times New Roman'
        r_auth.font.size = Pt(10.5)

        p_aff = doc.add_paragraph()
        p_aff.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_aff.paragraph_format.space_before = Pt(0)
        p_aff.paragraph_format.space_after = Pt(16)
        r_aff_label = p_aff.add_run("Afiliação: ")
        r_aff_label.font.name = 'Times New Roman'
        r_aff_label.font.size = Pt(10)
        r_aff_label.font.bold = True
        r_aff = p_aff.add_run(affiliation_text)
        r_aff.font.name = 'Times New Roman'
        r_aff.font.size = Pt(10)
        r_aff.font.italic = True
        r_aff.font.color.rgb = COLOR_MUTED
        return p_aff

    def add_abstract(text, keywords):
        p_h = doc.add_paragraph()
        p_h.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p_h.paragraph_format.space_before = Pt(8)
        p_h.paragraph_format.space_after = Pt(4)
        r_h = p_h.add_run("Resumo")
        r_h.font.name = 'Times New Roman'
        r_h.font.size = Pt(12)
        r_h.font.bold = True
        r_h.font.color.rgb = COLOR_PRIMARY

        p_abs = doc.add_paragraph()
        p_abs.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        p_abs.paragraph_format.space_before = Pt(0)
        p_abs.paragraph_format.space_after = Pt(6)
        p_abs.paragraph_format.line_spacing = 1.05
        r_abs = p_abs.add_run(text)
        r_abs.font.name = 'Times New Roman'
        r_abs.font.size = Pt(10)

        p_kw = doc.add_paragraph()
        p_kw.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        p_kw.paragraph_format.space_before = Pt(0)
        p_kw.paragraph_format.space_after = Pt(16)
        r_kw_l = p_kw.add_run("Palavras-chave: ")
        r_kw_l.font.name = 'Times New Roman'
        r_kw_l.font.size = Pt(10)
        r_kw_l.font.bold = True
        r_kw = p_kw.add_run(keywords)
        r_kw.font.name = 'Times New Roman'
        r_kw.font.size = Pt(10)
        return p_kw

    def add_h2(text):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.space_before = Pt(14)
        p.paragraph_format.space_after = Pt(6)
        p.paragraph_format.keep_with_next = True
        run = p.add_run(text)
        run.font.name = 'Times New Roman'
        run.font.size = Pt(12.5)
        run.font.bold = True
        run.font.color.rgb = COLOR_PRIMARY
        return p

    def add_h3(text):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.space_before = Pt(10)
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.keep_with_next = True
        run = p.add_run(text)
        run.font.name = 'Arial'
        run.font.size = Pt(11.5)
        run.font.bold = True
        run.font.color.rgb = COLOR_SECONDARY
        return p

    def add_h4(text):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.space_before = Pt(8)
        p.paragraph_format.space_after = Pt(3)
        p.paragraph_format.keep_with_next = True
        run = p.add_run(text)
        run.font.name = 'Arial'
        run.font.size = Pt(10.5)
        run.font.bold = True
        run.font.italic = True
        run.font.color.rgb = COLOR_TEXT
        return p

    def add_p(text, bold_prefix=None, indent=True, italic_suffix=None):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(6)
        p.paragraph_format.line_spacing = 1.15
        if indent:
            p.paragraph_format.first_line_indent = Cm(1.25)
        else:
            p.paragraph_format.first_line_indent = Cm(0)

        if bold_prefix:
            r_bp = p.add_run(bold_prefix)
            r_bp.font.name = 'Times New Roman'
            r_bp.font.size = Pt(11)
            r_bp.font.bold = True

        r = p.add_run(text)
        r.font.name = 'Times New Roman'
        r.font.size = Pt(11)

        if italic_suffix:
            r_is = p.add_run(italic_suffix)
            r_is.font.name = 'Times New Roman'
            r_is.font.size = Pt(11)
            r_is.font.italic = True

        return p

    def add_equation(eq_text, eq_number=None):
        """Cria uma linha de equação com alinhamento centralizado e número à direita."""
        tbl = doc.add_table(rows=1, cols=2)
        tbl.autofit = False
        tbl.alignment = WD_TABLE_ALIGNMENT.CENTER

        # Larguras: total 16.59 cm (largura útil da página)
        tbl.rows[0].cells[0].width = Cm(14.8)
        tbl.rows[0].cells[1].width = Cm(1.7)

        # Célula da Equação
        p0 = tbl.rows[0].cells[0].paragraphs[0]
        p0.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p0.paragraph_format.space_before = Pt(3)
        p0.paragraph_format.space_after = Pt(3)
        p0.paragraph_format.line_spacing = 1.0
        r0 = p0.add_run(eq_text)
        r0.font.name = 'Times New Roman'
        r0.font.size = Pt(11)
        r0.font.italic = True

        # Célula do Número da Equação
        p1 = tbl.rows[0].cells[1].paragraphs[0]
        p1.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        p1.paragraph_format.space_before = Pt(3)
        p1.paragraph_format.space_after = Pt(3)
        p1.paragraph_format.line_spacing = 1.0
        if eq_number:
            r1 = p1.add_run(f"({eq_number})")
            r1.font.name = 'Times New Roman'
            r1.font.size = Pt(10.5)

        # Remove bordas
        borders = parse_xml(
            f'<w:tblBorders {nsdecls("w")}>'
            f'<w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/>'
            f'<w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/>'
            f'</w:tblBorders>'
        )
        tbl._tbl.tblPr.append(borders)

        # Espaçamento após a tabela
        p_sp = doc.add_paragraph()
        p_sp.paragraph_format.space_before = Pt(0)
        p_sp.paragraph_format.space_after = Pt(3)
        p_sp.paragraph_format.line_spacing = 1.0
        return tbl

    def add_code_block(code_text, caption=None):
        """Insere um bloco de código estilizado com borda lateral e fonte Consolas."""
        if caption:
            p_cap = doc.add_paragraph()
            p_cap.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p_cap.paragraph_format.space_before = Pt(6)
            p_cap.paragraph_format.space_after = Pt(2)
            p_cap.paragraph_format.first_line_indent = Cm(0)
            r_cap_lbl = p_cap.add_run("Listagem de Código – ")
            r_cap_lbl.font.name = 'Arial'
            r_cap_lbl.font.size = Pt(9.5)
            r_cap_lbl.font.bold = True
            r_cap = p_cap.add_run(caption)
            r_cap.font.name = 'Arial'
            r_cap.font.size = Pt(9.5)
            r_cap.font.italic = True

        tbl = doc.add_table(rows=1, cols=1)
        tbl.autofit = False
        tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
        cell = tbl.rows[0].cells[0]
        cell.width = Cm(16.59)

        # Fundo cinza suave e borda azul à esquerda
        shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="F4F6F8"/>')
        cell._tc.get_or_add_tcPr().append(shd)

        borders = parse_xml(
            f'<w:tcBorders {nsdecls("w")}>'
            f'<w:top w:val="single" w:sz="4" w:space="0" w:color="D0D7DE"/>'
            f'<w:left w:val="single" w:sz="16" w:space="0" w:color="0969DA"/>'
            f'<w:bottom w:val="single" w:sz="4" w:space="0" w:color="D0D7DE"/>'
            f'<w:right w:val="single" w:sz="4" w:space="0" w:color="D0D7DE"/>'
            f'</w:tcBorders>'
        )
        cell._tc.get_or_add_tcPr().append(borders)

        p = cell.paragraphs[0]
        p.paragraph_format.space_before = Pt(4)
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.line_spacing = 1.0
        p.paragraph_format.left_indent = Cm(0.3)
        p.paragraph_format.right_indent = Cm(0.3)

        r = p.add_run(code_text.strip())
        r.font.name = 'Consolas'
        r.font.size = Pt(8.5)
        r.font.color.rgb = RGBColor(0x1F, 0x23, 0x28)

        p_sp = doc.add_paragraph()
        p_sp.paragraph_format.space_before = Pt(0)
        p_sp.paragraph_format.space_after = Pt(4)
        p_sp.paragraph_format.line_spacing = 1.0
        return tbl

    def add_table_custom(headers, data, caption=None, col_widths=None):
        """Cria uma tabela acadêmica padronizada com cabeçalho sombreado e bordas finas."""
        if caption:
            p_cap = doc.add_paragraph()
            p_cap.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p_cap.paragraph_format.space_before = Pt(8)
            p_cap.paragraph_format.space_after = Pt(4)
            p_cap.paragraph_format.first_line_indent = Cm(0)
            r_cap = p_cap.add_run(caption)
            r_cap.font.name = 'Arial'
            r_cap.font.size = Pt(10)
            r_cap.font.bold = True
            r_cap.font.color.rgb = COLOR_PRIMARY

        tbl = doc.add_table(rows=len(data) + 1, cols=len(headers))
        tbl.autofit = False
        tbl.alignment = WD_TABLE_ALIGNMENT.CENTER

        # Cabeçalho
        hdr_row = tbl.rows[0]
        for col_idx, header_text in enumerate(headers):
            cell = hdr_row.cells[col_idx]
            if col_widths and col_idx < len(col_widths):
                cell.width = col_widths[col_idx]
            shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="1E3A8A"/>')
            cell._tc.get_or_add_tcPr().append(shd)
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.space_before = Pt(4)
            p.paragraph_format.space_after = Pt(4)
            r = p.add_run(header_text)
            r.font.name = 'Arial'
            r.font.size = Pt(9.5)
            r.font.bold = True
            r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

        # Linhas de Dados
        for row_idx, row_values in enumerate(data):
            row = tbl.rows[row_idx + 1]
            bg_color = "F8FAFC" if row_idx % 2 == 1 else "FFFFFF"
            for col_idx, val in enumerate(row_values):
                cell = row.cells[col_idx]
                if col_widths and col_idx < len(col_widths):
                    cell.width = col_widths[col_idx]
                shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{bg_color}"/>')
                cell._tc.get_or_add_tcPr().append(shd)
                p = cell.paragraphs[0]
                p.paragraph_format.space_before = Pt(3)
                p.paragraph_format.space_after = Pt(3)
                p.paragraph_format.line_spacing = 1.05
                # Alinhamento: primeira coluna à esquerda ou centro se curto, demais justificado ou centro
                if len(str(val)) < 25 and not any(ch.isalpha() and len(val.split()) > 2 for ch in str(val)):
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                else:
                    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                r = p.add_run(str(val))
                r.font.name = 'Times New Roman'
                r.font.size = Pt(9.5)
                r.font.color.rgb = COLOR_TEXT

        # Aplica bordas sutis na tabela
        tbl_borders = parse_xml(
            f'<w:tblBorders {nsdecls("w")}>'
            f'<w:top w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>'
            f'<w:left w:val="none"/>'
            f'<w:bottom w:val="single" w:sz="8" w:space="0" w:color="1E3A8A"/>'
            f'<w:right w:val="none"/>'
            f'<w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>'
            f'<w:insideV w:val="none"/>'
            f'</w:tblBorders>'
        )
        tbl._tbl.tblPr.append(tbl_borders)

        p_sp = doc.add_paragraph()
        p_sp.paragraph_format.space_before = Pt(0)
        p_sp.paragraph_format.space_after = Pt(6)
        p_sp.paragraph_format.line_spacing = 1.0
        return tbl

    print("Iniciando composição do artigo...")

    # =========================================================================
    # TÍTULO, AUTORES E RESUMO
    # =========================================================================
    add_title("Do Navegador para a Planta: Uma Plataforma Web Gratuita para Simulação Dinâmica de Processos e Apoio ao Ensino de Engenharia Química")
    add_authors(
        "Felippe Petraso Fonseca Hübner, Breno Pinheiro Gallo de Sá, Leonardo Dantas de Souza Netto, Amanda Lemette Teixeira Brandão",
        "Grupo de Aplicações Avançadas em Processos (GAAP), Departamento de Engenharia Química e de Materiais (DEQM), Pontifícia Universidade Católica do Rio de Janeiro (PUC-Rio), Rio de Janeiro, Brasil"
    )

    resumo_texto = (
        "O ensino de Engenharia Química e de Processos demanda a constante transição entre formulações teóricas abstratas "
        "e a observação empírica do comportamento operacional de instalações industriais. Embora simuladores comerciais consolidados "
        "ofereçam alto rigor técnico, sua complexidade operacional e custos de licenciamento impõem barreiras cognitivas e materiais "
        "relevantes a estudantes em etapas formativas introdutórias. Este trabalho apresenta o GAAP Virtual Lab, uma plataforma web gratuita "
        "executada integralmente no navegador (client-side), concebida para fornecer um ambiente de experimentação dinâmica interativo "
        "em formato aberto (sandbox). Em seu núcleo de cálculo, a ferramenta articula primeiros princípios de conservação de quantidade "
        "de movimento, massa e energia, empregando uma arquitetura de solução híbrida que combina um solucionador sequencial orientado a "
        "pressão (push-based) para ramais acíclicos com um solucionador nodal simultâneo para malhas fechadas. O simulador implementa modelos "
        "hidrodinâmicos contínuos (Darcy-Weisbach com aproximação de Swamee-Jain e zona de transição suavizada), drenagem gravitacional em "
        "reservatórios (Torricelli e balanços de acúmulo), turbomáquinas regidas por curvas de carga, Leis de Afinidade e atenuação suave por "
        "cavitação (NPSH), válvulas com características de escoamento inerentes e tempos de curso, trocadores de calor pelo método da "
        "Efetividade-NTU sob rigorosas restrições da Segunda Lei da Termodinâmica, e malhas de controle de nível PI com proteção anti-windup por "
        "clamping. A arquitetura de software fundamenta-se nos princípios de Clean Architecture e Domain-Driven Design (DDD), implementada "
        "estritamente em JavaScript Vanilla (ES Modules) sem dependência de transpiladores ou empacotadores externos, assegurando a "
        "longevidade e a manutenibilidade do código por meio de documentação viva em padrão JSDoc e contratos de eventos tipados. A "
        "validação do sistema é atestada por uma suíte com mais de 100 testes automatizados em ambiente headless e pela convergência de "
        "cenários industriais frente a soluções analíticas e ao simulador de código aberto DWSIM, com desvios relativos inferiores a 1,8%. "
        "O GAAP Virtual Lab consolida-se como um recurso didático acessível e robusto para o aprendizado prático de engenharia de processos."
    )
    palavras_chave = "Simulação Dinâmica de Processos; Laboratório Virtual; Engenharia Química Educacional; Clean Architecture; Modelagem Fenomenológica; Interoperabilidade DWSIM."
    add_abstract(resumo_texto, palavras_chave)

    # =========================================================================
    # 1. INTRODUÇÃO
    # =========================================================================
    add_h2("1. Introdução")
    add_p(
        "A formação de engenheiros químicos e de processos exige sólida compreensão da mecânica dos fluidos, das operações unitárias, "
        "da transferência de calor e massa e da dinâmica de controle em regimes estacionário e transiente. Tradicionalmente, o aprendizado "
        "desses fenômenos apoia-se na resolução de equações diferenciais e algébricas em aulas teóricas e em ensaios pontuais em plantas-piloto "
        "laboratoriais. No ambiente profissional contemporâneo, ferramentas de simulação estática e dinâmica de processos — como ASPEN HYSYS®, "
        "Aspen Plus®, COMSOL Multiphysics®, PRO/II® e CHEMCAD® — representam o estado da arte para síntese, dimensionamento e otimização de "
        "unidades produtivas em escala industrial."
    )
    add_p(
        "A despeito de sua relevância incontestável no contexto industrial e na pós-graduação, a aplicação dessas plataformas comerciais em "
        "etapas iniciais e intermediárias da graduação enfrenta restrições pedagógicas e materiais expressivas. Conforme salientado na literatura "
        "recente sobre digitalização no ensino de engenharia (Udugama et al., 2023), interfaces industriais densas impõem uma elevada sobrecarga "
        "cognitiva aos estudantes. Com frequência, discentes despendem esforços desproporcionais tentando diagnosticar parâmetros numéricos obscuros, "
        "opções intrincadas de convergência matemática e configurações estáticas de correntes de processo, em detrimento da reflexão essencial sobre "
        "a fenomenologia de transporte e a resposta dinâmica do sistema. Adicionalmente, as barreiras financeiras associadas a licenças institucionais "
        "e a exigência de infraestrutura computacional corporativa restringem o acesso contínuo dos estudantes aos laboratórios físicos das universidades."
    )
    add_p(
        "Como alternativa, a literatura acadêmica tem explorado laboratórios virtuais e softwares de caráter educacional (Cartaxo et al., 2014; "
        "Rodrigues, 2022). No entanto, muitas soluções educacionais simplificadas padecem de dois extremos indesejáveis: de um lado, constituem meras "
        "calculadoras estáticas com visualização esquemática rígida; de outro, reduzem-se a animações visuais que empregam aproximações baseadas em "
        "demanda (pull-based), nas quais o fluxo é 'puxado' arbitrariamente pelo elemento consumidor final. Essa abordagem não reflete a física dos "
        "sistemas reais, colapsando computacionalmente quando submetida a recirculações, variações de pressão de jusante, perda de carga excessiva "
        "ou restrições de montante."
    )
    add_p(
        "Visando preencher essa lacuna, o Grupo de Aplicações Avançadas em Processos (GAAP) do Departamento de Engenharia Química e de Materiais "
        "da PUC-Rio concebeu e desenvolveu o GAAP Virtual Lab. A plataforma propõe um laboratório virtual interativo em formato aberto (sandbox), "
        "acessível diretamente pelo navegador web sem necessidade de instalação, plugins proprietários ou dependência de servidores de computação "
        "remotos. Inspirando-se na ergonomia visual intuitiva de ferramentas consagradas de prototipagem (como o Autodesk Tinkercad), o ambiente "
        "permite ao discente arrastar, conectar e operar componentes de planta (fontes, drenos, bombas centrífugas, válvulas de controle, tanques "
        "de armazenamento e trocadores de calor) de maneira imediata e flexível."
    )
    add_p(
        "A premissa central do projeto é garantir que a facilidade de interação visual jamais comprometa o rigor físico dos modelos empregados. "
        "O núcleo do simulador fundamenta-se em formulações dinâmicas de primeiros princípios e em um motor híbrido de solução hidráulica e térmica, "
        "estruturado sob padrões consolidados de engenharia de software (Clean Architecture e Domain-Driven Design). O presente artigo documenta "
        "a modelagem físico-matemática implementada, a arquitetura computacional do sistema, as práticas de engenharia de software e documentação viva "
        "(JSDoc) adotadas para garantir sua sustentabilidade a longo prazo, bem como a validação experimental e comparativa frente a soluções "
        "analíticas e ao simulador de processos de código aberto DWSIM."
    )

    # =========================================================================
    # 2. MODELAGEM FÍSICO-MATEMÁTICA E FENOMENOLÓGICA
    # =========================================================================
    add_h2("2. Modelagem Físico-Matemática e Fenomenológica")
    add_p(
        "O núcleo de cálculo do simulador foi concebido para resolver o comportamento transiente e estacionário de redes de processo incompressíveis, "
        "assegurando a conservação de quantidade de movimento, massa global e energia térmica. A seguir, detalham-se os modelos implementados para "
        "cada classe de equipamento e fenômeno físico."
    )

    # 2.1 Tubulações
    add_h3("2.1 Hidrodinâmica de Tubulações e Perda de Carga")
    add_p(
        "O escoamento em trechos de tubulação é modelado a partir da conservação de energia mecânica expressa pela equação de Darcy-Weisbach, "
        "incorporando a perda de carga distribuída por atrito viscoso e as perdas singulares associadas a conexões e acessórios:"
    )
    add_equation("ΔP = ( f · (L / D) + ΣK ) · ( ρ · v² / 2 )", "1")
    add_p(
        "onde ΔP representa a queda total de pressão no trecho (Pa, convertida internamente para bar), f é o fator de atrito adimensional de Darcy, "
        "L é o comprimento da tubulação (m), D é o diâmetro interno (m), ΣK é o somatório dos coeficientes de perda de carga localizada das singularidades "
        "presentes no trecho, ρ é a massa específica do fluido (kg/m³) e v é a velocidade média de escoamento na seção transversal (m/s)."
    )
    add_p(
        "A velocidade média é determinada a partir da vazão volumétrica Q e da área transversal A pela equação da continuidade:"
    )
    add_equation("v = Q / A = ( 4 · Q ) / ( π · D² )", "2")
    add_p(
        "A classificação do regime hidrodinâmico é governada pelo Número de Reynolds (Re):"
    )
    add_equation("Re = ( ρ · v · D ) / μ", "3")
    add_p(
        "onde μ denota a viscosidade dinâmica absoluta do fluido (Pa·s). Para viabilizar a execução contínua da simulação a aproximadamente 60 quadros "
        "por segundo (FPS) no navegador, sem incorrer no custo proibitivo de iterações implícitas de Newton-Raphson exigidas pela correlação de Colebrook-White, "
        "o fator de atrito f é calculado por uma formulação analítica híbrida e estritamente contínua implementada em PipeHydraulics.js:"
    )
    add_p(
        "a) Regime Laminar (Re ≤ 2300): adota-se a solução exata da Lei de Hagen-Poiseuille:"
    )
    add_equation("f_lam = 64 / Re", "4")
    add_p(
        "b) Regime Turbulento (Re ≥ 4000): emprega-se a correlação explícita de Swamee-Jain (1976), cuja concordância com Colebrook-White situa-se em desvios inferiores a 1%:"
    )
    add_equation("f_turb = 0.25 / [ log10( ( ε / (3.7 · D) ) + ( 5.74 / Re^0.9 ) ) ]²", "5")
    add_p(
        "onde ε representa a rugosidade absoluta média da parede interna do conduto (m)."
    )
    add_p(
        "c) Zona de Transição (2300 < Re < 4000): com o objetivo de eliminar saltos discretos e descontinuidades matemáticas que causariam instabilidade "
        "numérica e oscilações visuais no solucionador da rede, aplica-se uma interpolação linear contínua (lerp) ponderada pelo fator de transição "
        "blend = (Re - 2300) / (4000 - 2300):"
    )
    add_equation("f_trans = f_lam(2300) + blend · [ f_turb(4000) - f_lam(2300) ]", "6")
    add_p(
        "Por segurança contra divergências em condições extremas de parametrização, o valor resultante de f é limitado ao intervalo fisicamente "
        "consistente [0,008; 0,15]. Além disso, a plataforma disponibiliza o dimensionamento automático do diâmetro sugerido com base em uma velocidade "
        "de projeto recomendada (v_proj, convencionada em 2,0 m/s):"
    )
    add_equation("D_sugerido = √[ ( 4 · Q ) / ( π · v_projeto ) ]", "7")

    # 2.2 Tanques
    add_h3("2.2 Dinâmica de Acúmulo e Balanço de Massa em Tanques")
    add_p(
        "Os reservatórios verticais operam sob balanço diferencial de volume em regime transiente. A taxa instantânea de variação do inventário de líquido "
        "contido decorre do princípio da conservação de massa para fluidos incompressíveis:"
    )
    add_equation("dV / dt = Σ Q_in - Σ Q_out", "8")
    add_p(
        "A integração temporal é calculada numericamente pelo método de Euler explícito a cada passo de integração Δt:"
    )
    add_equation("V(t + Δt) = V(t) + ( Σ Q_in - Σ Q_out ) · Δt", "9")
    add_p(
        "A pressão estática absoluta no bocal de fundo do vaso é estabelecida pelo acoplamento entre a pressão no topo (atmosférica ou pressurizada) "
        "e a carga hidrostática da coluna líquida:"
    )
    add_equation("P_base = P_topo + ρ · g · h_nivel", "10")
    add_p(
        "onde g = 9,81 m/s² é a aceleração da gravidade e h_nivel é a cota da superfície livre em relação ao fundo, determinada pela geometria do tanque "
        "a partir da fração de preenchimento (h_nivel = (V / V_max) · H_util). Quando a descarga ocorre por orifício de fundo para a atmosfera, "
        "a vazão de drenagem livre obedece ao Teorema de Torricelli corrigido pelo coeficiente de contração e atrito do bocal (Cd = 0,82):"
    )
    add_equation("Q_descarga = C_d · A_orificio · √( 2 · g · h_nivel )", "11")
    add_p(
        "O tempo de residência hidráulico instantâneo do vaso (τ) é monitorado dinamicamente com base no inventário retido e na taxa de escoamento:"
    )
    add_equation("τ = V / Q_out   (ou τ = V / Q_in  quando  Q_out → 0)", "12")
    add_p(
        "Nas confluências em que correntes de fluidos distintos adentram o mesmo reservatório, as propriedades intensivas do conteúdo "
        "(massa específica ρ, viscosidade dinâmica μ e temperatura T) são continuamente recalculadas através de balanços ponderados de volume e entalpia:"
    )
    add_equation("ρ_mix = ( Σ ρ_i · V_i ) / ( Σ V_i ),       μ_mix = ( Σ μ_i · V_i ) / ( Σ V_i )", "13")
    add_equation("T_mix = ( Σ ρ_i · c_p,i · V_i · T_i ) / ( Σ ρ_i · c_p,i · V_i )", "14")

    # 2.3 Turbomáquinas
    add_h3("2.3 Turbomáquinas: Curvas Características, Leis de Afinidade e NPSH")
    add_p(
        "As bombas centrífugas são modeladas a partir de curvas características adimensionais de carga manométrica (H) em função da vazão volumétrica (Q). "
        "A curva de pressão desenvolvida pela máquina operando em rotação nominal sob acionamento relativo ω ∈ [0, 1] é descrita por uma função "
        "polinomial convexa:"
    )
    add_equation("H(Q, ω) = H_max · ω² · [ 1 - α · ( Q / ( Q_max · ω ) )² ]", "15")
    add_p(
        "onde H_max é a carga máxima em shut-off (vazão nula), Q_max é a vazão máxima teórica da bomba e α é um coeficiente de curvatura paramétrico. "
        "A modulação de velocidade angular via inversores de frequência (VFD) obedece rigorosamente às Leis de Afinidade de Máquinas de Fluxo:"
    )
    add_equation("Q ∝ ω,       H ∝ ω²,       P_eixo ∝ ω³", "16")
    add_p(
        "A potência hidráulica líquida transferida ao fluido (P_hid) e a potência mecânica consumida no eixo acionador (Brake Horsepower, P_eixo) "
        "são obtidas analiticamente por:"
    )
    add_equation("P_hid = ( ΔP_bar · Q_L/s ) / 10   [kW],       P_eixo = P_hid / η(Q)   [kW]", "17")
    add_p(
        "onde η(Q) é a eficiência total da bomba no ponto de operação, estimada a partir do rendimento no Ponto de Melhor Eficiência (BEP). "
        "Para avaliar o risco de cavitação, o simulador calcula em tempo real o balanço de energia na sucção, confrontando o NPSH Disponível (NPSHa) "
        "da instalação com o NPSH Requerido (NPSHr) da bomba:"
    )
    add_equation("NPSH_a = ( P_suc,abs - P_vap(T) ) / ( ρ · g ) + ( v_suc² / ( 2 · g ) )", "18")
    add_equation("NPSH_r(Q, ω) = NPSH_nom · ω² · [ 0.42 + 0.58 · ( Q / ( Q_max · ω ) )^1.8 ]", "19")
    add_p(
        "onde P_suc,abs é a pressão absoluta no flange de sucção e P_vap(T) é a pressão de vapor do fluido na temperatura de sucção. "
        "Na ocorrência de condição crítica (NPSHa < NPSHr), o simulador não interrompe abruptamente a execução, mas aplica um fator de degradação "
        "contínuo com atenuação exponencial suave (expoente 1,7) implementado em BombaLogica.js:"
    )
    add_equation("f_cavitacao = [ max( 0, NPSH_a / NPSH_r ) ]^1.7", "20")
    add_p(
        "Esse fator multiplica a carga desenvolvida e a eficiência do equipamento, modelando a perda de sustentação mecânica pelo colapso de bolhas "
        "de vapor e alertando o operador visualmente. Distingue-se ainda a cavitação por NPSH insuficiente da falta física de fluido na sucção, "
        "sinalizada de forma independente quando o tanque de montante atinge o esvaziamento completo."
    )

    # 2.4 Válvulas
    add_h3("2.4 Válvulas de Controle e Elementos Finais de Processo")
    add_p(
        "As válvulas de controle atuam como restrições hidráulicas de área variável. A perda de carga é modelada a partir da conversão clássica do "
        "coeficiente de vazão industrial (Cv em gal/min/psi^0.5 ou Kv em m³/h/bar^0.5) para um coeficiente de perda localizada equivalente (K_eq):"
    )
    add_equation("K_eq ≈ 0.00214 · ( D^4 / K_v² ),       com  K_v ≈ 0.865 · C_v", "21")
    add_p(
        "A relação entre a posição física do obturador (curso normalizado x ∈ [0, 1]) e a capacidade de condução efetiva depende da característica "
        "inerente da válvula, selecionável entre três perfis de projeto em ValvulaLogica.js:"
    )
    add_p("a) Linear: f(x) = x", indent=False)
    add_p("b) Igual Porcentagem (Equal Percentage): f(x) = R^(x - 1),  onde R denota a rangeabilidade (padrão R = 50)", indent=False)
    add_p("c) Abertura Rápida (Quick Opening): f(x) = √x", indent=False)
    add_p(
        "O posicionamento físico da haste incorpora a dinâmica de inércia do atuador, definida pelo tempo de curso de posicionamento completo "
        "(dx / dt = ± 1 / τ_curso). Quando a válvula atinge o fechamento estanque (x = 0), o acoplamento de montante e jusante é desacoplado, "
        "assegurando isolamento de pressão físico (P_saida = P_jusante e ΔP_bloqueio = P_in - P_jusante) e impedindo transmissões irreais de pressão estática."
    )

    # 2.5 Termodinâmica e Trocadores de Calor
    add_h3("2.5 Termodinâmica e Trocadores de Calor")
    add_p(
        "O simulador transcende a simplificação isotérmica habitual incorporando a dependência térmica contínua das propriedades físicas dos fluidos. "
        "Para a fase aquosa, a densidade é descrita por uma função racional que reproduz com exatidão a anomalia térmica em torno de 3,98 °C, munida "
        "de cotas numéricas de segurança para prevenir singularidades nas imediações de -68 °C:"
    )
    add_equation("ρ(T) = ρ_ref · max( 0.1,  1 - [ ( T - 3.98 )² · ( T + 286.9 ) ] / [ 508929.2 · ( T + 68.12 ) ] )", "22")
    add_p(
        "A pressão de vapor da água é computada através da formulação de Antoine ancorada ao ponto padrão de referência (25 °C, 0,0317 bar), "
        "enquanto a viscosidade segue a relação de Andrade com salvaguarda estrita para temperaturas absolutas (T_K ≥ 1 K)."
    )
    add_p(
        "Os trocadores de calor operam com base no Método da Efetividade-NTU (ε-NTU). O componente suporta operação em duas correntes de processo "
        "hidraulicamente independentes (Corrente 1: in1/out1; Corrente 2: in2/out2) ou com fluido de utilidade térmica infinito (T_serviço constante). "
        "As capacidades térmicas das correntes são expressas a partir das vazões volumétricas (Q_i) e calores específicos (c_p,i):"
    )
    add_equation("C_1 = ρ_1 · Q_1 · c_p,1,       C_2 = ρ_2 · Q_2 · c_p,2", "23")
    add_equation("C_min = min( C_1, C_2 ),       C_max = max( C_1, C_2 ),       C_r = C_min / C_max", "24")
    add_p(
        "O Número de Unidades de Transferência (NTU) e a efetividade térmica (ε) são calculados conforme a configuração topológica dos ramos:"
    )
    add_equation("NTU = ( U · A ) / C_min", "25")
    add_p(
        "a) Arranjo em Contracorrente (detectado automaticamente quando a Corrente 2 ingressa por out2 e deixa por in2):"
    )
    add_equation("ε_contra = [ 1 - exp( -NTU · ( 1 - C_r ) ) ] / [ 1 - C_r · exp( -NTU · ( 1 - C_r ) ) ]   (se C_r < 1)", "26")
    add_equation("ε_contra = NTU / ( 1 + NTU )   (se C_r = 1)", "27")
    add_p(
        "b) Arranjo em Co-corrente / Escoamento Paralelo (ambas as correntes escoam no mesmo sentido longitudinal):"
    )
    add_equation("ε_paralelo = [ 1 - exp( -NTU · ( 1 + C_r ) ) ] / [ 1 + C_r ]", "28")
    add_p(
        "c) Modo Utilidade Térmica (apenas uma corrente conectada, operando contra reservatório de temperatura constante, onde C_r = 0):"
    )
    add_equation("ε_utilidade = 1 - exp( -NTU )", "29")
    add_p(
        "A taxa de transferência de calor transferida (q) e as temperaturas acopladas de descarga satisfazem os balanços entálpicos da Primeira Lei:"
    )
    add_equation("q = ε · C_min · | T_1,in - T_2,in |", "30")
    add_equation("T_1,out = T_1,in ∓ ( q / C_1 ),       T_2,out = T_2,in ± ( q / C_2 )", "31")
    add_p(
        "O modelo impõe salvaguardas rígidas baseadas na Segunda Lei da Termodinâmica: no arranjo paralelo, as temperaturas convergem "
        "assintoticamente para o equilíbrio térmico mútuo, sendo estritamente proibido o cruzamento térmico (T_1,out ≥ T_2,out se T_1,in ≥ T_2,in). "
        "Adicionalmente, se qualquer uma das correntes atinge vazão nula em conexão física ativa, a taxa de calor é sumariamente anulada (q = 0), "
        "impedindo trocas fictícias com fluido estagnado. Em tempo de execução, a plataforma calcula ainda a Diferença Média Logarítmica de Temperatura (LMTD) "
        "e a aproximação térmica mínima (Pinch Point, ΔT_min):"
    )
    add_equation("LMTD = ( ΔT_a - ΔT_b ) / ln( ΔT_a / ΔT_b ),       ΔT_min = min( ΔT_a, ΔT_b )", "32")

    # 2.6 Solver Hidráulico Híbrido
    add_h3("2.6 Arquitetura de Solução Hidráulica Híbrida")
    add_p(
        "A integração simultânea dos múltiplos componentes distribuídos no canvas é conduzida por um motor híbrido de resolução de redes "
        "(HydraulicNetworkAnalyzer.js e NodalHydraulicSolver.js). A cada iteração temporal, a topologia geral da planta é particionada em "
        "'Ilhas Hidráulicas' funcionalmente independentes:"
    )
    add_p(
        "1. Ilhas Acíclicas (Redes Abertas): quando um ramo não contém laços de recirculação (ex.: Fonte → Bomba → Válvula → Tanque → Dreno), "
        "o motor aciona o solucionador sequencial orientado a pressão (push-based). As pressões motrizes propagam-se de montante para jusante, "
        "dividindo as vazões em bifurcações paralelizadas proporcionalmente à condutância hidráulica de cada ramo. Para amortecer perturbações bruscas, "
        "aplica-se relaxamento dinâmico de primeira ordem baseado na inércia da tubulação:"
    )
    add_equation("Q_transiente^(t + Δt) = Q_transiente^t + ( Q_estacionaria - Q_transiente^t ) · [ 1 - exp( -Δt / τ_resposta ) ]", "33")
    add_p(
        "Caso um componente passante (válvula, bomba ou trocador) sofra restrição a jusante e não consiga transferir toda a vazão admitida "
        "(Q_out < Q_in), aciona-se a rotina balancePassThroughMass(), que retropropaga a perda de carga reduzindo a vazão de admissão até anular o resíduo."
    )
    add_p(
        "2. Ilhas Cíclicas (Recirculações e Anéis Fechados): na presença de ciclos de tubulação fechados sobre si mesmos (como retornos para a sucção "
        "de bombas), a formulação linear sequencial torna-se indeterminada. Nesses casos, o motor delega a resolução ao NodalHydraulicSolver.js. "
        "A malha é tratada como um circuito fechado e o sistema calcula a vazão convergida por busca de raiz via bisseção numérica sobre a função "
        "residual de pressão em torno do laço fechado:"
    )
    add_equation("ε(Q) = P_in + P_bomba(Q) - ΔP_perdas(Q) - P_out = 0", "34")
    add_p(
        "Essa formulação híbrida assegura alto desempenho computacional (60 FPS no navegador) para a maior parte das configurações acíclicas usuais, "
        "mantendo estabilidade e robustez matemática na presença de laços fechados complexos."
    )

    # =========================================================================
    # 3. ARQUITETURA DE SOFTWARE E ENGENHARIA DO BACK-END
    # =========================================================================
    add_h2("3. Arquitetura de Software e Engenharia do Back-end")
    add_p(
        "Projetos de software científico em ambiente acadêmico frequentemente enfrentam o desafio da descontinuidade após a graduação dos estudantes "
        "desenvolvedores. Para evitar a degradação estrutural do código e viabilizar manutenções e extensões futuras por novos pesquisadores, o "
        "GAAP Virtual Lab foi integralmente estruturado sob os preceitos de Clean Architecture e Domain-Driven Design (DDD). O desenvolvimento foi "
        "conduzido estritamente em JavaScript Vanilla modular (padrão ECMAScript ES Modules), deliberadamente dispensando ferramentas complexas de "
        "empacotamento (bundlers como Webpack ou Vite) e frameworks reativos de vida útil efêmera. Dessa forma, qualquer usuário ou pesquisador "
        "pode clonar o repositório e executar a plataforma imediatamente em qualquer navegador moderno."
    )
    add_p(
        "O sistema organiza-se em quatro camadas concêntricas com estrita blindagem de dependências: a camada mais interna desconhece as camadas "
        "externas, impedindo o acoplamento de equações físicas a elementos visuais da interface (DOM, SVG ou Canvas)."
    )

    # Tabela 1: Clean Architecture
    t1_headers = ["Camada", "Módulos Principais", "Responsabilidade de Engenharia"]
    t1_data = [
        ["Domain\n(Domínio Físico)", "BaseComponente, TanqueLogico, BombaLogica, ValvulaLogica, TrocadorCalorLogico, PipeHydraulics, NodalHydraulicSolver, LevelController", "Física e matemática pura de processos. Isola leis de conservação, equações de perda de carga, modelos termodinâmicos e algoritmos de controle sem qualquer referência a DOM, HTML, SVG ou bibliotecas gráficas."],
        ["Application\n(Aplicação)", "SimulationEngine, SimulationTickPipeline, TopologyGraph, ConnectionService, EventTypes, EventPayloads", "Orquestração do ciclo da simulação em tempo real, indexação do grafo topológico em memória, fatiamento de ilhas hidráulicas e despacho de mensagens desacopladas."],
        ["Presentation\n(Apresentação)", "CameraController, DragDropController, WorkspaceUndoRedo, TankComponentPropertiesPresenter, PumpDwsimJsonExporter, DwsimImporter", "Gestão de eventos do usuário (mouse, teclado, atalhos de zoom/pan e seleção múltipla), apresentação de propriedades em painéis reativos bidirecionais e módulos de interoperabilidade."],
        ["Infrastructure\n(Infraestrutura)", "ComponentVisualFactory, PipeRenderer, TankChartAdapter, FluidVisualStyle, CustomSelectHelper", "Renderização visual vetorial SVG de conexões, animação fluida de partículas, estilos dinâmicos de cor de fluidos e adaptadores para gráficos em tempo real da biblioteca Chart.js."]
    ]
    t1_widths = [Cm(3.2), Cm(5.2), Cm(8.19)]
    add_table_custom(t1_headers, t1_data, "Tabela 1 – Camadas da Clean Architecture implementadas no GAAP Virtual Lab.", t1_widths)

    add_h3("3.1 O Pipeline de Execução (SimulationTickPipeline)")
    add_p(
        "O avanço temporal da simulação é regido por requestAnimationFrame, garantindo sincronia perfeita com a taxa de atualização do monitor. "
        "Em SimulationTickPipeline.js, o ciclo de cada quadro é orquestrado em oito etapas estritamente sequenciadas:"
    )
    add_p("1. calculateDeltaTime(timestamp): calcula o passo temporal real decorrido entre quadros, aplicando teto de segurança numérico estrito (dt = clamp(dt_real, 0, 0,1 s)) para impedir explosões numéricas quando a aba do navegador perde o foco.", indent=False)
    add_p("2. updateHighLevelControls(dt): executa a amostragem e os algoritmos dos controladores de nível (PI/PID) antes da resolução física da malha, modulando antecipadamente as posições das válvulas acopladas.", indent=False)
    add_p("3. updateComponentDynamics(dt): integra variáveis transientes mecânicas dos componentes, tais como a rampa de aceleração de motores de bombas e o tempo de curso de posicionamento de atuadores de válvulas.", indent=False)
    add_p("4. resolveHydraulicNetwork(dt): aciona os analisadores de grafo e os solucionadores hidráulicos (sequencial ou nodal), estabelecendo vazões, perfis de pressão e misturas composicionais de correntes.", indent=False)
    add_p("5. syncComponentMetrics(dt): integra o acúmulo de volume nos tanques via método de Euler, computa os tempos de residência hidráulicos e atualiza balanços térmicos nos trocadores de calor.", indent=False)
    add_p("6. updateVisuals(): reflete os estados físicos nas representações vetoriais SVG, atualizando espessuras de linha, sentidos das setas de fluxo conforme a orientação dos componentes e coloração dos fluidos.", indent=False)
    add_p("7. publishUpdates(): transmite cargas úteis tipadas e imutáveis através do barramento de eventos, alimentando painéis laterais de propriedades e atualizando os buffers de dados dos gráficos temporais.", indent=False)
    add_p("8. updateSolverMetrics(): atualiza contadores internos de iteração e métricas de desempenho para auditoria de convergência.", indent=False)

    add_h3("3.2 Gestão de Estado e Ergonomia da Interface")
    add_p(
        "A experiência do usuário no GAAP Virtual Lab foi desenhada para combinar fluidez operacional e reprodutibilidade. A topologia completa "
        "da rede é mantida em uma estrutura de dados de grafo em memória (TopologyGraph.js), desacoplada da árvore do DOM. Para facilitar o estudo "
        "interativo, a plataforma adota o padrão de projeto Command gerenciado pelo módulo ActionHistory, oferecendo suporte integral a operações "
        "de Desfazer (Ctrl+Z) e Refazer (Ctrl+Y ou Ctrl+Shift+Z) para adição, remoção, movimentação espacial, conexões de tubulação e edições numéricas "
        "de parâmetros. A ferramenta oferece ainda seleção múltipla por retângulo azul delimitador ou Ctrl+clique, clonagem de blocos e subsistemas "
        "completos (Ctrl+C e Ctrl+V) mantendo a integridade das conexões internas, e alternância entre visualização esquemática bidimensional e "
        "consideração explícita de cotas de elevação física relativa entre bocais."
    )

    # =========================================================================
    # 4. PADRÕES DE DOCUMENTAÇÃO E ENGENHARIA DE SOFTWARE
    # =========================================================================
    add_h2("4. Padrões de Documentação do Código e Engenharia de Software Sustentável")
    add_p(
        "A longevidade de plataformas científicas de código aberto repousa criticamente sobre a qualidade e clareza de sua documentação. "
        "Em contextos universitários, onde a rotatividade de discentes é contínua a cada ciclo letivo, a perda gradual do conhecimento sobre as "
        "decisões de projeto e hipóteses fenomenológicas constitui o principal gargalo de manutenção. Para sanar esse desafio, o GAAP Virtual Lab "
        "instituiu uma política rigorosa de documentação viva integrada ao código-fonte através do padrão formal JSDoc e contratos imutáveis de eventos."
    )

    add_h3("4.1 Documentação Fenomenológica e Numérica via JSDoc")
    add_p(
        "Ao contrário de comentários triviais que se limitam a parafrasear a sintaxe da linguagem, os blocos JSDoc no domínio físico expõem "
        "explicitamente a dedução matemática, os limites de validade física e as motivações para a escolha dos esquemas de estabilização numérica. "
        "A seguir, reproduzem-se trechos reais da documentação presentes no núcleo do simulador:"
    )

    add_h4("A. Justificativa de Estabilidade no Fator de Atrito (PipeHydraulics.js)")
    add_p(
        "A documentação técnica detalha por que a correlação explícita de Swamee-Jain foi selecionada em detrimento de Colebrook-White para o laço "
        "a 60 FPS, além de justificar a interpolação suave na transição:"
    )
    code_pipe = (
        "/**\n"
        " * Fator de friccao de Darcy usando correlacao de Swamee-Jain, com\n"
        " * interpolacao suave na faixa de transicao.\n"
        " * \n"
        " * @param {number} reynolds - Numero de Reynolds (adimensional, Re = rho * v * D / mu).\n"
        " * @param {number} relativeRoughness - Rugosidade relativa da parede interna (epsilon / D).\n"
        " * @returns {number} Fator de atrito de Darcy (f, adimensional).\n"
        " * \n"
        " * @description\n"
        " * - Regime Laminar (Re <= 2300): Solucao exata da Lei de Poiseuille: f = 64 / Re.\n"
        " * - Regime Turbulento (Re >= 4000): Aproximacao explicita de Swamee-Jain (1976).\n"
        " *   Evita solucionadores iterativos implicitos no laco de animacao a 60 FPS.\n"
        " * - Zona de Transicao (2300 < Re < 4000): Interpolacao linear (lerp) continua entre flam(2300)\n"
        " *   e fturb(4000). Esta estrategia previne descontinuidades matematicas e oscilacoes numericas\n"
        " *   (flickering) no solucionador hidraulico da rede.\n"
        " */\n"
        "export function darcyFrictionFactor(reynolds, relativeRoughness) {\n"
        "    if (!Number.isFinite(reynolds) || reynolds <= 0) return DEFAULT_PIPE_FRICTION;\n"
        "    if (reynolds < 2300) return 64 / reynolds;\n"
        "\n"
        "    const turbulent = 0.25 / Math.pow(\n"
        "        Math.log10((relativeRoughness / 3.7) + (5.74 / Math.pow(reynolds, 0.9))),\n"
        "        2\n"
        "    );\n"
        "\n"
        "    if (reynolds < 4000) {\n"
        "        const laminar = 64 / reynolds;\n"
        "        const blend = (reynolds - 2300) / (4000 - 2300);\n"
        "        const lerp = (start, end, t) => start + ((end - start) * t);\n"
        "        return clamp(lerp(laminar, turbulent, blend), 0.008, 0.15);\n"
        "    }\n"
        "\n"
        "    return clamp(turbulent, 0.008, 0.15);\n"
        "}"
    )
    add_code_block(code_pipe, "Cálculo analítico contínuo do fator de atrito de Darcy (PipeHydraulics.js).")

    add_h4("B. Modelagem de Degradação por Cavitação e Inércia Operacional (BombaLogica.js)")
    add_p(
        "O modelo descreve a resposta funcional da bomba centrífuga diante de sucção insuficiente, empregando potência amortecida para "
        "mitigar chaveamentos caóticos liga/desliga na interface:"
    )
    code_pump = (
        "/**\n"
        " * Avalia o fator de degradacao de carga e eficiencia por cavitacao (NPSH).\n"
        " * \n"
        " * @param {number} npshDisponivelM - Altura de succao positiva liquida disponivel (NPSHa, em metros).\n"
        " * @param {number} npshRequeridoM - Altura liquida minima exigida pelo fabricante (NPSHr, em metros).\n"
        " * @returns {number} Fator multiplicativo de desempenho na faixa [0.0, 1.0].\n"
        " * \n"
        " * @description\n"
        " * Modela a formacao de bolhas de vapor na succao do rotor quando NPSHa < NPSHr.\n"
        " * Aplica uma curva de atenuacao suave com expoente 1.7:\n"
        " *   fator = Math.pow(Math.max(0, npshDisponivelM / npshRequeridoM), 1.7)\n"
        " * Essa formulacao evita descontinuidades bruscas de vazao (liga/desliga caotico)\n"
        " * e emite alertas contextuais de cavitacao na interface do usuario.\n"
        " */\n"
        "calcularFatorCavitacao(npshDisponivelM, npshRequeridoM = this.npshRequeridoAtualM ?? this.npshRequeridoM) {\n"
        "    const npshRequeridoSeguroM = Math.max(0.05, npshRequeridoM);\n"
        "    const npshDisponivelSeguroM = Number.isFinite(Number(npshDisponivelM))\n"
        "        ? Math.max(0, Number(npshDisponivelM))\n"
        "        : 0;\n"
        "    if (npshDisponivelSeguroM <= EPSILON_FLOW) return 0;\n"
        "    if (npshDisponivelSeguroM >= npshRequeridoSeguroM) return 1;\n"
        "    return clamp(Math.pow(npshDisponivelSeguroM / npshRequeridoSeguroM, 1.7), 0, 1);\n"
        "}"
    )
    add_code_block(code_pump, "Atenuação contínua de desempenho de turbomáquinas por cavitação (BombaLogica.js).")

    add_h4("C. Balanço de Acúmulo e Proteção Anti-Windup (LevelController.js)")
    add_p(
        "A documentação formaliza o algoritmo Proporcional-Integral discreto dotado de histerese por banda morta (deadband), reinicialização "
        "por inversão de sinal de erro e clamping integral contra saturação de atuador:"
    )
    code_ctrl = (
        "/**\n"
        " * Executa o laco de controle Proporcional-Integral (PI) com Anti-Windup para nivel do tanque.\n"
        " * \n"
        " * @param {Object} params - Parametros operacionais da malha fechada.\n"
        " * @param {number} params.setpoint - Ponto de ajuste desejado (SP, fracao 0 a 1).\n"
        " * @param {number} params.measurement - Variavel de processo atual medida (PV, fracao 0 a 1).\n"
        " * @param {number} params.dt - Passo de tempo em segundos.\n"
        " * @param {number} params.kp - Ganho proporcional.\n"
        " * @param {number} params.ki - Ganho integral.\n"
        " * @returns {Object} Objeto contendo o sinal de atuacao normalizado u e diagnosticos de saturacao.\n"
        " * \n"
        " * @description\n"
        " * 1. Aplica zona morta e banda de reativacao para suprimir oscilacoes infinitesimais em regime estacionario.\n"
        " * 2. Zera a memoria integral se o erro cruzar o zero (mudanca de sinal: lastError * error < 0).\n"
        " * 3. Limita o acumulador integral por clamping (integralLimit = 1 / ki) impedindo efeito windup\n"
        " *    quando a valvula atinge 100% de abertura ou fechamento completo.\n"
        " */\n"
        "export function calculatePidLevelControl({ setpoint, measurement, dt, kp = 0, ki = 0, kd = 0, state, config }) {\n"
        "    const error = clamp((Number(setpoint) || 0) - (Number(measurement) || 0), -1, 1);\n"
        "    if (Math.abs(error) <= config.deadband) {\n"
        "        state.integral = 0; state.resting = true; return { u: 0, inRest: true, saturated: false };\n"
        "    }\n"
        "    if (state.lastError !== undefined && state.lastError * error < 0) state.integral = 0;\n"
        "    state.integral += error * dt;\n"
        "    const integralLimit = ki > 0 ? 1 / ki : 1;\n"
        "    state.integral = clamp(state.integral, -integralLimit, integralLimit);\n"
        "    const rawOutput = (kp * error) + (ki * state.integral);\n"
        "    const u = clamp(rawOutput, config.outputMin, config.outputMax);\n"
        "    return { u, error, integral: state.integral, saturated: u !== rawOutput };\n"
        "}"
    )
    add_code_block(code_ctrl, "Controlador de nível discreto com anti-windup e histerese (LevelController.js).")

    add_h3("4.2 Contratos Formais e Barramento de Eventos Desacoplado")
    add_p(
        "Em linguagens dinâmicas sem verificação estática nativa em tempo de compilação, como o JavaScript, a comunicação desregrada entre "
        "módulos frequentemente acarreta erros de grafia em propriedades de objetos e acoplamentos espúrios. Para contornar essa fragilidade sem "
        "recorrer a transpiladores como TypeScript, o GAAP Virtual Lab estabelece uma infraestrutura de contratos formais fundamentada em "
        "fábricas de eventos congeladas via Object.freeze() (EventTypes.js, EventPayloads.js e ComponentEventPayloads.js)."
    )
    add_p(
        "Qualquer alteração física nos equipamentos — como modulação de abertura de válvulas, elevação de inventário em tanques ou atualização de "
        "entalpia em trocadores — propaga-se unicamente através de payloads imutáveis e padronizados. Esse mecanismo blinda as camadas lógicas de "
        "domínio contra mutações acidentais originadas na interface e assegura previsibilidade rigorosa aos painéis de monitoramento e gráficos."
    )

    # =========================================================================
    # 5. METODOLOGIA DE VALIDAÇÃO E RESULTADOS EXPERIMENTAIS
    # =========================================================================
    add_h2("5. Metodologia de Validação e Resultados Experimentais")
    add_p(
        "A verificação e validação da plataforma fundamentam-se em uma abordagem em duas frentes: uma bateria extensiva de testes automatizados "
        "executados em modo headless e a replicação de nove cenários de plantas de processo reais salvas nos arquivos padronizados "
        "teste planta.json e teste_trocatroca.json, comparando as grandezas convergidas com deduções analíticas e com o simulador DWSIM."
    )

    add_h3("5.1 Suíte de Testes Automatizados Headless")
    add_p(
        "Para atestar o rigor matemático do motor independentemente de renderizadores gráficos, o projeto possui uma suíte com mais de 100 testes "
        "automatizados unitários e de integração (cenarios-aplicacao.test.mjs, topologia-e-solver.test.mjs e validar-calculos.mjs), executados "
        "diretamente em ambiente Node.js nativo (node --test). Essa suíte audita:"
    )
    add_p("a) Conservação estrita de balanço de massa (resíduo |ΣQin - ΣQout| < 10^-5 L/s) em cadeias lineares longas de até 30 componentes passantes seriados;", indent=False)
    add_p("b) Preservação de propriedades intensivas e conservação entálpica em confluências e misturas de correntes com diferentes densidades e calores específicos;", indent=False)
    add_p("c) Isolamento físico de pressão em válvulas fechadas, confirmando a retenção integral do diferencial estático sem vazamento sub-representado;", indent=False)
    add_p("d) Não proliferação de vazões artificiais em malhas fechadas desprovidas de fontes ou elementos propulsores ativos;", indent=False)
    add_p("e) Convergência robusta do algoritmo de busca de raiz no solucionador nodal para circuitos com bombas centrífugas em anéis de recirculação.", indent=False)

    add_h3("5.2 Validação do Regime Transiente e Controle PI com Anti-Windup")
    add_p(
        "O ensaio de dinâmica e controle em malha fechada foi avaliado no subsistema da Ilha 6 de teste planta.json, composto por uma bomba de "
        "recalque (P-05, Q_nom = 45 L/s), um tanque amortecedor (T-07, capacidade 1000 L, altura útil 2,4 m) e uma válvula de descarga linear "
        "(V-05, Cv = 220). O objetivo pedagógico consistiu em avaliar o rastreamento automático do setpoint de nível estipulado em 57% (570 L) "
        "sob sintonia proporcional-integral (Kp = 4,0; Ki = 0,6; Kd = 0,0)."
    )
    add_p(
        "Durante a fase de enchimento inicial transiente, a vazão fornecida pela bomba (27,77 L/s sob elevação de ΔP = 3,10 bar) superou a demanda "
        "inicial de saída. Conforme o volume se aproximou da meta, o termo integral foi protegido pelo mecanismo de clamping (limitado a ±1/Ki = ±1,67), "
        "evitando o acúmulo desmedido de erro. Quando o nível atingiu o limiar de 57%, o algoritmo modulou progressivamente a abertura da válvula V-05 "
        "para 34,4% (gerando uma perda localizada de ΔP_valv = 2,764 bar), equalizando com precisão as taxas de entrada e saída. O inventário do vaso "
        "estabilizou-se em 567,2 L (56,7%), exibindo dinâmica amortecida com sobre-elevação (overshoot) inferior a 0,5% e eliminando trepidações na banda de repouso."
    )

    add_h3("5.3 Validação dos Limites da 2ª Lei da Termodinâmica em Trocadores de Calor")
    add_p(
        "Para atestar o rigor fenomenológico do modelo de transferência de calor, foram conduzidos ensaios comparativos controlados no arquivo "
        "teste_trocatroca.json. Três trocadores de calor com parâmetros construtivos idênticos (UA = 2500 W/K e ε_max = 0,95) foram submetidos "
        "às mesmas condições de alimentação com água: uma corrente fria a 25,0 °C (P = 1,5 bar, Q ≈ 0,40 L/s) e uma corrente quente a 80,0 °C "
        "(P = 1,5 bar, Q ≈ 0,39 L/s), variando-se exclusivamente o arranjo topológico das conexões:"
    )
    add_p(
        "1. Modo Monostream em Utilidade Térmica: a Corrente 1 é aquecida por vapor de serviço constante a 80,0 °C (capacidade infinita, C_r = 0). "
        "O NTU atinge 1,506 e a efetividade teórica ε = 1 - e^-1,506 = 77,8% é reproduzida com exatidão pelo simulador, elevando o fluido frio "
        "de 25,0 °C para 67,8 °C e transferindo uma taxa térmica de q = 71,08 kW."
    )
    add_p(
        "2. Modo Dual-Stream em Co-corrente (Escoamento Paralelo): ambas as correntes escoam no mesmo sentido. Pela dedução analítica da formulação "
        "ε-NTU para escoamento paralelo com C_r = 0,941, o teto assintótico intransponível imposto pela Segunda Lei é ε_max = 1 / (1 + C_r) ≈ 51,5%. "
        "O simulador convergiu para ε = 49,0% (taxa de 43,23 kW), com as temperaturas dos efluentes convergindo para o equilíbrio térmico mútuo "
        "(T_fria = 50,4 °C e T_quente = 53,0 °C), comprovando o respeito absoluto à restrição de não-cruzamento de temperaturas."
    )
    add_p(
        "3. Modo Dual-Stream em Contracorrente: invertendo-se a orientação do ramo quente (admissão retrógrada), a força motriz térmica média (LMTD) "
        "é substancialmente ampliada. A efetividade saltou para 62,4% e a energia recuperada elevou-se para 54,68 kW (+26,5% em comparação à co-corrente). "
        "Mais relevante pedagogicamente, ocorreu o fenômeno do cruzamento térmico estrito: o fluido frio de saída atingiu 56,9 °C, deixando o equipamento "
        "11,2 °C mais quente do que o fluido de descarte da corrente quente (45,7 °C). A Tabela 2 sintetiza os resultados observados."
    )

    # Tabela 2: Trocadores de calor
    t2_headers = ["Arranjo Térmico", "Alimentação Fria", "Alimentação Quente", "Vazão (L/s)", "Efetividade (ε)", "Taxa Térmica", "Descarga Fria", "Descarga Quente", "Fenômeno Físico"]
    t2_data = [
        ["Monostream\n(Utilidade)", "25,0 °C\n(1,5 bar)", "Vapor de Serviço\n(80,0 °C fixo)", "Q1 = 0,398\nQ2 = ∞", "77,8 %\n(Teórico: 77,8%)", "71,08 kW", "67,8 °C", "80,0 °C\n(Serviço)", "Aquecimento sob capacidade infinita (Cr = 0)."],
        ["Dual-Stream\nCo-corrente", "25,0 °C\n(1,5 bar)", "80,0 °C\n(1,5 bar)", "Q1 = 0,409\nQ2 = 0,385", "49,0 %\n(Teto: 51,5%)", "43,23 kW", "50,4 °C", "53,0 °C", "Equilíbrio térmico sem cruzamento de temperaturas."],
        ["Dual-Stream\nContracorrente", "25,0 °C\n(1,5 bar)", "80,0 °C\n(1,5 bar)", "Q1 = 0,409\nQ2 = 0,385", "62,4 %\n(Sem teto Cr)", "54,68 kW\n(+26,5 %)", "56,9 °C", "45,7 °C", "Cruzamento térmico genuíno (T1,out > T2,out)."]
    ]
    t2_widths = [Cm(2.2), Cm(1.7), Cm(1.9), Cm(1.6), Cm(1.8), Cm(1.6), Cm(1.6), Cm(1.6), Cm(2.59)]
    add_table_custom(t2_headers, t2_data, "Tabela 2 – Resultados quantitativos comparativos dos regimes térmicos no trocador de calor (UA = 2500 W/K).", t2_widths)

    add_h3("5.4 Diagnóstico Pedagógico de Gargalos Físicos vs. Compensação Artificial")
    add_p(
        "Um princípio orientador primordial do GAAP Virtual Lab é sua postura pedagógica perante erros de dimensionamento cometidos pelos estudantes. "
        "Diferente de sistemas simplificados que compensam matematicamente parâmetros inviáveis para evitar falhas de tela — mascarando o erro conceitual —, "
        "a plataforma alerta o operador de forma transparente. Se o usuário prescreve um setpoint de nível inatingível porque a bomba de montante não "
        "desenvolve carga suficiente ou porque a válvula de jusante é estreita demais (Cv insuficiente gerando perda excessiva), o motor detecta a "
        "inviabilidade e emite o diagnóstico 'Saída Saturada no Set Point'."
    )
    add_p(
        "A notificação é exibida em um painel contextual superior e disponibiliza ações didáticas de recomendação: o sistema sugere a elevação da pressão "
        "de fonte, o redimensionamento do rotor da bomba ou a ampliação do diâmetro nominal da linha. Esse retorno pedagógico imediato reproduz as tomadas "
        "de decisão inerentes à engenharia de processos real."
    )

    add_h3("5.5 Interoperabilidade com o DWSIM")
    add_p(
        "A interoperabilidade com ecossistemas de engenharia consolidados foi concretizada através de dois módulos especializados: o "
        "PumpDwsimJsonExporter.js e o DwsimImporter.js. O primeiro converte curvas experimentais de turbomáquinas obtidas no canvas diretamente "
        "para a estrutura de dados CurveSet JSON reconhecida pelo simulador DWSIM, viabilizando a transferência imediata de dados de bombas "
        "(carga manométrica, rendimento e NPSHr em múltiplos pontos de amostragem)."
    )
    add_p(
        "Por sua vez, o DwsimImporter.js viabiliza a tradução de fluxogramas nativos do DWSIM (.dwxmz e .xml) diretamente no navegador, empregando "
        "a API nativa de descompressão Web Streams (DecompressionStream('deflate-raw')). O módulo mapeia SimulationObjects (bombas, válvulas, "
        "tanques, trocadores de calor, aquecedores, resfriadores e correntes de matéria) e GraphicObjects em componentes correspondentes do GAAP Virtual Lab, "
        "alinhando-os à grade vetorial e preservando parametrizações térmicas e de pressão. Testes comparativos de escoamento e perda de carga entre "
        "ambos os simuladores para tubulações de 3 polegadas e quedas de pressão em válvulas atestaram desvio relativo médio inferior a 1,8%, "
        "validando a acurácia do solucionador."
    )

    # Tabela 3: Síntese dos Cenários
    t3_headers = ["Arquivo / Subsistema", "Componentes Principais", "Condição Operacional", "Ponto Convergido", "Conclusão Física / Pedagógica"]
    t3_data = [
        ["teste planta.json\n(Ilha 1)", "Entrada-01, Bomba P-01, Saída-01", "Recalque direto com fonte a 0,5 bar e dreno a 0 bar", "Q = 8,89 L/s, ΔP = 4,83 bar, BHP = 6,62 kW", "Operação à esquerda do BEP; validação da curva H-Q e BHP."],
        ["teste planta.json\n(Ilha 2)", "Entrada-02, Tanque T-01, Saída-02", "Drenagem por orifício de fundo em tubo de 3\" sem válvula", "Q_in = Q_out = 16,67 L/s, V retido ≈ 1,7 L", "Descarga por gravidade desimpedida com inventário desprezível."],
        ["teste planta.json\n(Ilha 3)", "Entrada-02-c, Tanque T-01-c, Válvula V-01, Saída", "Tanque descarregando com válvula linear a 50% (Cv = 220)", "Q = 16,28 L/s, V = 998,4 L (99,8%), ΔP_v = 0,38 bar", "Formação de coluna hidrostática para vencer restrição da válvula."],
        ["teste planta.json\n(Ilha 4)", "Entrada, Bomba P-02, Tanque T-06, Válvula, Saída", "Recalque de alta vazão com vaso pulmão intermediário", "Q = 27,77 L/s, ΔP_bomba = 3,10 bar, η = 77,5%", "Operação no BEP da bomba; perda expressiva na válvula (1,10 bar)."],
        ["teste planta.json\n(Ilha 5)", "Entrada-03, Válvula V-02, Saída-03", "Estrangulamento por válvula Equal Percentage a 50%", "Q = 3,75 L/s, ΔP_v = 0,285 bar, Cv_efetivo ≈ 29,2", "Comprovação da restrição não linear exponencial de vazão."],
        ["teste planta.json\n(Ilha 6)", "Entrada-05, Bomba P-05, Tanque T-07, Válvula V-05", "Controle PI de nível ativo com Setpoint em 57% (570 L)", "V = 567,2 L (56,7%), Abertura modulada = 34,4%", "Estabilização em malha fechada sem overshoot por anti-windup."],
        ["teste_trocatroca.json\n(Cenário 1)", "Entrada-01, Trocador TC-01, Válvula, Saída", "Aquecimento monostream com utilidade térmica a 80 °C", "Q1 = 0,398 L/s, T1: 25 → 67,8 °C, ε = 77,8%", "Aquecimento sob capacidade infinita de utilidade (Cr = 0)."],
        ["teste_trocatroca.json\n(Cenário 2)", "Entradas Fria/Quente, Trocador, Válvulas, Saídas", "Escoamento paralelo / co-corrente com fluidos a 25 e 80 °C", "T1: 25 → 50,4 °C, T2: 80 → 53,0 °C, ε = 49,0%", "Convergência ao equilíbrio térmico mútuo (respeito à 2ª Lei)."],
        ["teste_trocatroca.json\n(Cenário 3)", "Entradas Fria/Quente retrógrada, Trocador, Saídas", "Escoamento em contracorrente puro com fluidos a 25 e 80 °C", "T1: 25 → 56,9 °C, T2: 80 → 45,7 °C, ε = 62,4%", "Cruzamento térmico legítimo (T1,out > T2,out; +26,5% de calor)."]
    ]
    t3_widths = [Cm(2.6), Cm(3.2), Cm(3.5), Cm(3.4), Cm(3.89)]
    add_table_custom(t3_headers, t3_data, "Tabela 3 – Síntese física e fenomenológica dos nove cenários de bancada validados no simulador.", t3_widths)

    # =========================================================================
    # 6. CONCLUSÕES E TRABALHOS FUTUROS
    # =========================================================================
    add_h2("6. Conclusões e Trabalhos Futuros")
    add_p(
        "O GAAP Virtual Lab consolida-se como uma plataforma web inovadora e de livre acesso para o aprimoramento e a democratização do ensino "
        "de Engenharia Química e de Processos. Ao integrar a facilidade ergonômica de uma interface em formato de laboratório virtual aberto "
        "(sandbox) à precisão de modelos matemáticos baseados em primeiros princípios, a ferramenta elimina as barreiras financeiras de "
        "licenciamento institucional e atenua a sobrecarga cognitiva imposta por pacotes comerciais em etapas introdutórias de formação universitária."
    )
    add_p(
        "A adoção estrita de padrões de engenharia de software fundamentados em Clean Architecture, Domain-Driven Design e JavaScript Vanilla "
        "(ES Modules) confere alta sustentabilidade ao projeto, garantindo que o simulador possa ser mantido e expandido por novas turmas de "
        "pesquisadores sem riscos de obsolescência de dependências de compilação. A documentação sistemática viva no padrão JSDoc e a "
        "formalização de contratos desacoplados de eventos estabelecem uma salvaguarda perene para as hipóteses fenomenológicas e numéricas "
        "adotadas, como demonstrado na estabilização do fator de atrito e no amortecimento contínuo da cavitação por NPSH."
    )
    add_p(
        "Os ensaios comparativos de validação — abrangendo uma suíte de testes com mais de 100 rotinas automatizadas e a reprodução de nove cenários "
        "industriais complexos — demonstraram excelente acurácia na resposta transiente de malhas de controle PI com proteção anti-windup, "
        "concordância termodinâmica estrita com a Segunda Lei em trocadores de calor em co-corrente e contracorrente, e interoperabilidade "
        "efetiva com o simulador DWSIM com desvios relativos inferiores a 1,8%."
    )
    add_p(
        "Como etapas de continuidade e expansão do projeto, planejam-se: (i) a inclusão de operações unitárias reacionais homogêneas contínuas "
        "(reatores CSTR e PFR regidos por cinética de Arrhenius); (ii) a modelagem simplificada de separação por equilíbrio líquido-vapor "
        "(vasos de flash e colunas de destilação binária); (iii) o aprimoramento do solucionador nodal simultâneo para suporte a matrizes de redes "
        "fechadas arbitrariamente interconectadas; e (iv) a condução de estudos formais de eficácia pedagógica em turmas regulares de graduação "
        "para quantificar o impacto da ferramenta no ganho de intuição fenomenológica dos estudantes."
    )

    # =========================================================================
    # REFERÊNCIAS BIBLIOGRÁFICAS
    # =========================================================================
    add_h2("Referências Bibliográficas")

    refs = [
        "BIRD, R. B.; STEWART, W. E.; LIGHTFOOT, E. N. Transport phenomena. 2. ed. New York: John Wiley & Sons, 2002.",
        "CARTAXO, S. J. M.; SILVINO, P. F. G.; FERNANDES, F. A. N. Transient analysis of shell-and-tube heat exchangers using an educational software. Education for Chemical Engineers, v. 9, n. 3, p. 77–84, 2014.",
        "DE LA TORRE, L. et al. Providing collaborative support to virtual and remote laboratories. IEEE Transactions on Learning Technologies, v. 8, n. 4, p. 393–406, 2015.",
        "FOX, R. W.; MCDONALD, A. T.; PRITCHARD, P. J. Introdução à Mecânica dos Fluidos. 8. ed. Rio de Janeiro: LTC, 2014.",
        "INCROPERA, F. P. et al. Fundamentos de Transferência de Calor e de Massa. 7. ed. Rio de Janeiro: LTC, 2014.",
        "MEDEIROS, D. S. DWSIM: Open Source Chemical Process Simulator. Versão 8.0, 2023. Disponível em: <https://dwsim.org>. Acesso em: 10 set. 2026.",
        "OGUNNAIKE, B. A.; RAY, W. H. Process dynamics, modeling, and control. New York: Oxford University Press, 1994.",
        "RODRIGUES, R. Uso do simulador EMSO em aulas de operações unitárias para projeto de trocadores de calor e evaporadores. In: Process Systems Engineering Brazil, Universidade Federal do Paraná, p. 11–13, 2022.",
        "SEBORG, D. E. et al. Process dynamics and control. 4. ed. Hoboken: John Wiley & Sons, 2016.",
        "SELBAS, R. et al. Thermodynamic optimization of a heat exchanger. International Journal of Energy Research, v. 30, n. 5, p. 311–324, 2006.",
        "SMITH, J. M.; VAN NESS, H. C.; ABBOTT, M. M. Introdução à Termodinâmica da Engenharia Química. 7. ed. Rio de Janeiro: LTC, 2007.",
        "SWAMEE, P. K.; JAIN, A. K. Explicit equations for pipe-flow problems. Journal of the Hydraulics Division, ASCE, v. 102, n. 5, p. 657–664, 1976.",
        "UDUGAMA, I. A. et al. Digitalization in chemical engineering: The state of the art and future perspectives. Education for Chemical Engineers, v. 43, p. 1–15, 2023."
    ]

    for ref in refs:
        p_ref = doc.add_paragraph()
        p_ref.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        p_ref.paragraph_format.space_before = Pt(0)
        p_ref.paragraph_format.space_after = Pt(6)
        p_ref.paragraph_format.line_spacing = 1.05
        p_ref.paragraph_format.first_line_indent = Cm(0)
        r_ref = p_ref.add_run(ref)
        r_ref.font.name = 'Times New Roman'
        r_ref.font.size = Pt(10)

    # Salva o arquivo final
    doc.save(output_path)
    print(f"Artigo gerado com sucesso em: {output_path}")

if __name__ == '__main__':
    target = os.path.abspath('docs/Artigo Cientifico - GAAP Virtual Lab V2.docx')
    create_full_article(target)
