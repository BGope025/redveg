from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, Image

out = Path(r'D:\Redveg\output\pdf\aizen-technologies-service-bill-2026-10-21.pdf')
out.parent.mkdir(parents=True, exist_ok=True)
ink=colors.HexColor('#1C2028'); muted=colors.HexColor('#68717E'); red=colors.HexColor('#18365D'); pale=colors.HexColor('#F2F5F8'); line=colors.HexColor('#DDE3EA')
doc=SimpleDocTemplate(str(out),pagesize=A4,rightMargin=22*mm,leftMargin=22*mm,topMargin=18*mm,bottomMargin=18*mm,title='AIZEN TECHNOLOGIES - Service Bill',author='AIZEN TECHNOLOGIES')
s=getSampleStyleSheet()
def style(name, **kw): s.add(ParagraphStyle(name=name,parent=s['Normal'],**kw))
style('Brand',fontName='Helvetica-Bold',fontSize=19,leading=23,textColor=ink)
style('Tag',fontName='Helvetica',fontSize=8,leading=11,textColor=muted)
style('TitleRight',fontName='Helvetica-Bold',fontSize=23,leading=27,textColor=ink,alignment=2)
style('Label',fontName='Helvetica-Bold',fontSize=8,leading=11,textColor=muted)
style('Value',fontName='Helvetica-Bold',fontSize=10,leading=14,textColor=ink)
style('Section',fontName='Helvetica-Bold',fontSize=9,leading=12,textColor=red)
style('Body2',fontName='Helvetica',fontSize=9,leading=13,textColor=ink)
style('Small2',fontName='Helvetica',fontSize=8,leading=11,textColor=muted)
style('ScopeHeading',fontName='Helvetica-Bold',fontSize=10,leading=14,textColor=ink)
style('ScopeBody',fontName='Helvetica',fontSize=8.6,leading=12,textColor=ink)
style('Th',fontName='Helvetica-Bold',fontSize=8,leading=10,textColor=colors.white)
style('Amount',fontName='Helvetica-Bold',fontSize=10,leading=13,textColor=ink,alignment=2)
style('TotalLabel',fontName='Helvetica-Bold',fontSize=10,leading=14,textColor=colors.white)
style('TotalValue',fontName='Helvetica-Bold',fontSize=18,leading=22,textColor=colors.white,alignment=2)
P=lambda t,st='Body2':Paragraph(t,s[st])
story=[]
brand_logo=Image(r'C:\Users\anura\AppData\Local\Temp\codex-clipboard-4ff0e79b-7213-4f0b-9503-eb5187db6117.png',width=43*mm,height=39.5*mm)
head=Table([[brand_logo,P('SERVICE BILL','TitleRight')]],colWidths=[100*mm,66*mm],rowHeights=[40*mm])
head.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'MIDDLE'),('ALIGN',(1,0),(1,-1),'RIGHT'),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0)]))
story += [head,Spacer(1,7*mm),Table([['']],colWidths=[166*mm],rowHeights=[1.2*mm],style=TableStyle([('BACKGROUND',(0,0),(-1,-1),red)])),Spacer(1,7*mm)]
meta=Table([[P('BILL REFERENCE','Label'),P('ISSUE DATE','Label'),P('PAYMENT STATUS','Label')],[P('AZ-20261021-01','Value'),P('21 October 2026','Value'),P('DUE','Value')]],colWidths=[58*mm,54*mm,54*mm])
meta.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),pale),('BOX',(0,0),(-1,-1),.5,line),('INNERGRID',(0,0),(-1,-1),.5,line),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,0),7),('BOTTOMPADDING',(0,0),(-1,0),2),('TOPPADDING',(0,1),(-1,1),2),('BOTTOMPADDING',(0,1),(-1,1),8)]))
story += [meta,Spacer(1,7*mm),P('BILL TO','Section'),Spacer(1,2*mm)]
client=Table([[P('CLIENT / COMPANY','Label')],[P('<b>REDVEG FOOD VENTURES PRIVATE LIMITED COMPANY</b>')],[P('BILLING ADDRESS','Label')],[P('Prantik Sarani, Rabindra Nagar, Dum Dum Cantonment, P.O, Dum Dum, Kolkata, West Bengal 700065')]],colWidths=[166*mm],rowHeights=[6*mm,9*mm,6*mm,None])
client.setStyle(TableStyle([('BOX',(0,0),(-1,-1),.5,line),('INNERGRID',(0,0),(-1,-1),.35,line),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3)]))
story += [client,Spacer(1,7*mm),P('SERVICE DETAILS','Section'),Spacer(1,2*mm)]
items=Table([[P('DESCRIPTION','Th'),P('QTY','Th'),P('AMOUNT','Th')],[P('<b>RedVeg admin and operations updates</b><br/>Four work areas: secure account management, role-based permissions, manual order creation, and configurable delivery and offer settings. See the following page for the detailed scope.'),P('1'),P('INR 3,500.00','Amount')]],colWidths=[112*mm,18*mm,36*mm],repeatRows=1)
items.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),ink),('BOX',(0,0),(-1,-1),.5,line),('INNERGRID',(0,0),(-1,-1),.5,line),('VALIGN',(0,0),(-1,-1),'TOP'),('ALIGN',(1,0),(1,-1),'CENTER'),('ALIGN',(2,0),(2,-1),'RIGHT'),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,0),8),('BOTTOMPADDING',(0,0),(-1,0),8),('TOPPADDING',(0,1),(-1,-1),11),('BOTTOMPADDING',(0,1),(-1,-1),11)]))
story += [items,Spacer(1,4*mm)]
total=Table([[P('TOTAL AMOUNT DUE','TotalLabel'),P('INR 3,500.00','TotalValue')]],colWidths=[100*mm,66*mm])
total.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),red),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),12),('RIGHTPADDING',(0,0),(-1,-1),12),('TOPPADDING',(0,0),(-1,-1),10),('BOTTOMPADDING',(0,0),(-1,-1),10)]))
story += [total,Spacer(1,2*mm),P('Amount in words: Indian Rupees Three Thousand Five Hundred Only','Small2'),Spacer(1,7*mm)]
note=Table([[P('PAYMENT','Section')],[P('Payment is due on receipt. Please include bill reference AZ-20261021-01 with your payment.')]],colWidths=[166*mm])
note.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),pale),('BOX',(0,0),(-1,-1),.5,line),('LINEBELOW',(0,0),(-1,0),.5,line),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
story += [note,Spacer(1,10*mm)]
story.append(Table([[P('For AIZEN TECHNOLOGIES','Value')],[P('Authorized signatory','Small2')]],colWidths=[83*mm],rowHeights=[8*mm,7*mm],style=TableStyle([('LINEABOVE',(0,0),(-1,0),.7,ink),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),('TOPPADDING',(0,0),(-1,-1),5)])))
story += [PageBreak(),P('WORK COMPLETED','Section'),Spacer(1,2*mm),P('Detailed breakdown of the RedVeg project updates covered by this bill.','Small2'),Spacer(1,5*mm)]

scope_sections = [
 ('1. Admin Login & Password Management', 'Forgot Password / Reset Password option.<br/>Separate secure logins for Owner, Admin, Editor and other employees.<br/>Employee account activation and deactivation.<br/>Role-based access permissions.<br/>Login and activity logs.'),
 ('2. Role-Based Access Control', 'Owner: Full business control, manual order creation, employee permissions and access to sensitive reports.<br/>Admin: Manage operations and create manual orders, subject to assigned permissions.<br/>Editor: Access only assigned sections; cannot create manual orders or access restricted financial data.<br/>Customer Support / Data Entry: Update authorized customer and order information, but cannot create manual orders, edit restricted prices or access financial masters.<br/>Permissions enforced at the backend/API level, not only through UI restrictions.'),
 ('3. Manual Order Creation', 'Create New Order feature accessible only to Owner and authorized Admin users.<br/>Search existing customers by name or phone number; add new customers where permitted.<br/>Select products, weight, variants, cutting options and quantity.<br/>Automatically calculate subtotal, discounts, delivery charges and grand total.<br/>Record payment method and payment status; add delivery address, delivery slot and customer notes.<br/>Generate a unique Order ID and save the order in the common Order Master/database.<br/>Record creator, timestamp and order source as "Admin Manual".<br/>Prevent unauthorized employees from creating orders through the API.<br/>Do not mark payment as Paid without verification.'),
 ('4. Delivery & Offer Configuration', 'Configurable settings for minimum order value (initially INR 999), delivery radius (initially 5 km), Free Delivery ON/OFF toggle and delivery charges.<br/>Coupon and discount eligibility, plus minimum order requirements for offers.<br/>Settings editable by authorized Admin users and not hard-coded into the application.'),
]
for heading, body in scope_sections:
    box=Table([[P(heading,'ScopeHeading')],[P(body,'ScopeBody')]],colWidths=[166*mm])
    box.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),pale),('BOX',(0,0),(-1,-1),.5,line),('LINEBELOW',(0,0),(-1,0),.5,line),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
    story += [KeepTogether([box,Spacer(1,3*mm)])]
def footer(c,d):
 c.saveState(); w,h=A4; c.setStrokeColor(line); c.setLineWidth(.5); c.line(22*mm,13*mm,w-22*mm,13*mm); c.setFont('Helvetica',7.5); c.setFillColor(muted); c.drawString(22*mm,8.5*mm,'AIZEN TECHNOLOGIES  |  Thank you for your business'); c.drawRightString(w-22*mm,8.5*mm,f'Page {d.page}'); c.restoreState()
doc.build(story,onFirstPage=footer,onLaterPages=footer)
print(out)
